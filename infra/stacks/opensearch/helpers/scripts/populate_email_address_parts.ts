/**
 * Add the `email_parts` analyzer and the `.parts` address multi-fields to the
 * live emails index, in place, and repopulate existing docs.
 *
 * Why in place rather than the reindex runbook: the only difference between
 * an emails index that predates #4898 and the body in create_indices.ts is
 * five additive multi-fields (`sender.parts`, `reply_to.parts`,
 * `recipients.parts`, `cc.parts`, `bcc.parts`) plus the analyzer they use.
 * A v1 -> v2 reindex needs a second copy of the index — 212GB of primaries,
 * 640GB with prod's two replicas — which does not fit on a cluster sitting at
 * 78% disk. Rewriting in place needs only the transient overhead of the docs
 * being rewritten.
 *
 * `.parts` is a multi-field of data already in `_source`, so nothing has to be
 * re-fetched from Postgres: re-indexing a doc as-is populates it.
 *
 * Phases (run in order, each is safe to re-run):
 *
 *   PHASE=mapping   close the index, add the analyzer (a static setting, so
 *                   the index must be closed), reopen, then PUT the mapping.
 *                   The close is a brief hard outage for email search and
 *                   indexing — seconds in practice, but writes that fail past
 *                   their consumer retries need a bounded
 *                   `POST /internal/backfill/emails` replay afterwards.
 *   PHASE=rewrite   repopulate existing docs with a chunked
 *                   `_update_by_query`. Chunks are `sent_at_millis` ranges
 *                   and each one skips docs that already have `.parts`, so
 *                   interrupting and re-running costs nothing.
 *   PHASE=verify    report how many docs still lack `.parts`.
 *
 * Rewriting holds the old copy of every doc until a merge reclaims it — the
 * dev rehearsal grew primaries 33% — so `rewrite` refuses to start a chunk
 * while free disk is under MIN_FREE_GB and waits for merges to catch up
 * between chunks. Sized so a chunk's churn stays well inside the cluster's
 * headroom above the high watermark.
 *
 * Usage:
 *   PHASE=mapping DRY_RUN=false bun scripts/populate_email_address_parts.ts
 *   PHASE=rewrite DRY_RUN=false bun scripts/populate_email_address_parts.ts
 *   PHASE=verify bun scripts/populate_email_address_parts.ts
 *
 * Env: MAX_DOCS_PER_CHUNK (2_000_000), REQUESTS_PER_SECOND (2000),
 *      MIN_FREE_GB (40), SETTLE_TIMEOUT_MINUTES (30), ALIAS (emails).
 */
import type { Client } from '@opensearch-project/opensearch';
import { IS_DRY_RUN } from '../constants';

const ADDRESS_FIELDS = ['sender', 'reply_to', 'recipients', 'cc', 'bcc'];

/** Mirrors EMAIL_PARTS_ANALYSIS in create_indices.ts. */
const EMAIL_PARTS_ANALYSIS = {
  analysis: {
    char_filter: {
      email_separators: {
        type: 'mapping',
        mappings: ['@ => \\u0020', '. => \\u0020', '+ => \\u0020'],
      },
    },
    analyzer: {
      email_parts: {
        type: 'custom',
        char_filter: ['email_separators'],
        tokenizer: 'standard',
        filter: ['lowercase'],
      },
    },
  },
};

/** Mirrors EMAIL_ADDRESS_FIELD in create_indices.ts, per address field. */
const PARTS_MAPPING = {
  properties: Object.fromEntries(
    ADDRESS_FIELDS.map((field) => [
      field,
      {
        type: 'keyword',
        index: true,
        doc_values: true,
        fields: { parts: { type: 'text', analyzer: 'email_parts' } },
      },
    ])
  ),
};

/** The `.parts` sub-field of the first address field, used as the done-marker. */
const DONE_MARKER_FIELD = `${ADDRESS_FIELDS[0]}.parts`;

export type HistogramBucket = { key: number; doc_count: number };

/**
 * One unit of work: a half-open `sent_at_millis` range, or the docs that carry
 * no `sent_at_millis` at all (prod has a few dozen) — those match no range, so
 * without their own chunk they would be silently skipped.
 */
export type RewriteChunk =
  | { kind: 'range'; from: number; to: number; docs: number }
  | { kind: 'undated'; docs: number };

/**
 * Group monthly histogram buckets into contiguous `sent_at_millis` ranges of
 * at most `maxDocsPerChunk` docs.
 *
 * A single month heavier than the cap becomes its own oversized chunk rather
 * than being split: month boundaries keep the ranges human-readable in logs
 * and re-runs, and the disk guard between chunks is what actually bounds
 * risk. Empty buckets are dropped so quiet months don't pad the plan.
 * `to` is exclusive.
 */
export function planChunks(
  buckets: HistogramBucket[],
  maxDocsPerChunk: number
): RewriteChunk[] {
  const chunks: { from: number; to: number; docs: number }[] = [];
  let current: { from: number; to: number; docs: number } | undefined;

  for (const bucket of buckets) {
    if (bucket.doc_count === 0) continue;
    if (current && current.docs + bucket.doc_count > maxDocsPerChunk) {
      chunks.push(current);
      current = undefined;
    }
    if (!current) {
      current = { from: bucket.key, to: bucket.key, docs: 0 };
    }
    current.docs += bucket.doc_count;
    current.to = bucket.key;
  }
  if (current) chunks.push(current);

  // Widen each chunk's end to the start of the next so the ranges tile the
  // whole timeline, and leave the last one open-ended for mail that arrives
  // mid-migration.
  return chunks.map((chunk, index) => ({
    kind: 'range' as const,
    from: chunk.from,
    docs: chunk.docs,
    to:
      index + 1 < chunks.length
        ? chunks[index + 1].from
        : Number.MAX_SAFE_INTEGER,
  }));
}

/**
 * Execution order. Newest-first (the default) is what you want on a run this
 * long: recent mail is what people search, so recall comes back on the mail
 * that matters within the first chunks instead of after every backfilled year.
 * Undated docs always go last — there are a handful and they sort nowhere.
 */
export function orderChunks(
  chunks: RewriteChunk[],
  order: 'newest' | 'oldest'
): RewriteChunk[] {
  const ranges = chunks.filter((chunk) => chunk.kind === 'range');
  const undated = chunks.filter((chunk) => chunk.kind === 'undated');
  return [...(order === 'newest' ? [...ranges].reverse() : ranges), ...undated];
}

const GB = 1024 ** 3;

/**
 * Retry a read against the cluster.
 *
 * This job runs for hours, and against prod it runs through an SSH tunnel into
 * the VPC. A dropped tunnel or a single slow response surfaces as a client-side
 * `TimeoutError`, which used to kill the whole run — while the server-side
 * `_update_by_query` carried on to completion, so the operator was left
 * guessing what had actually landed. Reads are idempotent, so retry them.
 */
async function withRetry<T>(
  label: string,
  read: () => Promise<T>,
  attempts = 6
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await read();
    } catch (error) {
      lastError = error;
      const delaySeconds = Math.min(60, 5 * 2 ** (attempt - 1));
      console.log(
        `  ${label} failed (attempt ${attempt}/${attempts}): ${(error as Error).message}. ` +
          `retrying in ${delaySeconds}s`
      );
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }
  }
  throw lastError;
}

/**
 * An already-running rewrite task on this index, if any.
 *
 * Submitting `_update_by_query` is the one call that isn't safe to retry — a
 * submission that succeeds and then times out client-side leaves a task we
 * can't see, and blindly submitting again would rewrite the same docs twice.
 * So on every chunk we look for a live task first and attach to it instead.
 * That makes a restart after a dropped connection pick up the in-flight work
 * rather than duplicating it.
 *
 * `search_processing_service` also issues `_update_by_query` against this index
 * to denormalize thread properties, but those are single-doc and unsliced;
 * ours are sliced and cover millions, so `slices` tells them apart.
 */
async function findRunningRewriteTask(
  client: Client,
  index: string
): Promise<string | undefined> {
  const response = await withRetry('tasks.list', () =>
    client.tasks.list({ actions: '*byquery*', detailed: true })
  );
  for (const node of Object.values(response.body.nodes ?? {})) {
    const tasks =
      (
        node as {
          tasks: Record<
            string,
            {
              parent_task_id?: string;
              description?: string;
              status?: { slices?: unknown[]; total?: number };
            }
          >;
        }
      ).tasks ?? {};
    for (const [taskId, task] of Object.entries(tasks)) {
      if (task.parent_task_id) continue;
      if (task.description && !task.description.includes(index)) continue;
      const sliced = (task.status?.slices?.length ?? 0) > 0;
      if (sliced) return taskId;
    }
  }
  return undefined;
}

async function physicalIndexBehindAlias(
  client: Client,
  alias: string
): Promise<string> {
  const response = await client.indices
    .getAlias({ name: alias })
    .catch(() => undefined);
  if (!response) {
    throw new Error(
      `alias "${alias}" does not exist on this cluster — check ALIAS and OPENSEARCH_URL`
    );
  }
  const indices = Object.keys(response.body ?? {});
  if (indices.length !== 1) {
    throw new Error(
      `alias "${alias}" resolves to ${indices.length} indices (${indices.join(', ')}) — expected exactly one`
    );
  }
  return indices[0];
}

/** Smallest free-disk figure across data nodes, in bytes. */
async function minFreeBytes(client: Client): Promise<number> {
  const response = await withRetry('cat.allocation', () =>
    client.cat.allocation({ format: 'json', bytes: 'b' })
  );
  const rows = (response.body ?? []) as { 'disk.avail'?: string }[];
  const avail = rows
    .map((row) => Number(row['disk.avail']))
    .filter((value) => Number.isFinite(value));
  if (avail.length === 0) throw new Error('could not read node disk figures');
  return Math.min(...avail);
}

async function waitForGreen(client: Client, index: string) {
  const response = await client.cluster.health({
    index,
    wait_for_status: 'green',
    timeout: '120s',
  });
  console.log(
    `  health: ${response.body.status} (active ${response.body.active_shards}, unassigned ${response.body.unassigned_shards})`
  );
}

async function runMapping(client: Client, index: string) {
  console.log(`\n== mapping phase on ${index} ==`);
  if (IS_DRY_RUN) {
    console.log(
      '[DRY-RUN] Would close the index, add the email_parts analyzer,'
    );
    console.log('[DRY-RUN] reopen it, then PUT:');
    console.log(JSON.stringify(PARTS_MAPPING, null, 2));
    return;
  }

  // The analyzer is a static index setting, so it can only be added while the
  // index is closed. Everything between here and _open is an outage for email
  // search and indexing, so keep it to exactly these two calls.
  console.log('closing index...');
  await client.indices.close({ index });
  try {
    console.log('adding email_parts analyzer...');
    await client.indices.putSettings({ index, body: EMAIL_PARTS_ANALYSIS });
  } finally {
    console.log('reopening index...');
    await client.indices.open({ index });
  }
  await waitForGreen(client, index);

  console.log('adding .parts multi-fields...');
  await client.indices.putMapping({ index, body: PARTS_MAPPING });

  const analyzed = await client.indices.analyze({
    index,
    body: { analyzer: 'email_parts', text: 'jane.doe+tag@mail.foo.com' },
  });
  const tokens = (analyzed.body.tokens ?? []).map(
    (token: { token: string }) => token.token
  );
  console.log(
    `✓ analyzer check: jane.doe+tag@mail.foo.com -> ${tokens.join(', ')}`
  );
  console.log(
    '\nNext: replay anything dropped during the close with a bounded\n' +
      'POST /internal/backfill/emails, then run PHASE=rewrite.'
  );
}

/** Docs in this chunk that still need rewriting. */
function chunkQuery(chunk: RewriteChunk): Record<string, unknown> {
  const notDone = { exists: { field: DONE_MARKER_FIELD } };
  if (chunk.kind === 'undated') {
    return {
      bool: { must_not: [notDone, { exists: { field: 'sent_at_millis' } }] },
    };
  }
  return {
    bool: {
      filter: {
        range: {
          sent_at_millis: {
            gte: chunk.from,
            ...(chunk.to === Number.MAX_SAFE_INTEGER ? {} : { lt: chunk.to }),
          },
        },
      },
      must_not: notDone,
    },
  };
}

const day = (millis: number) => new Date(millis).toISOString().slice(0, 10);

function chunkLabel(chunk: RewriteChunk): string {
  if (chunk.kind === 'undated') return 'no sent_at';
  const to = chunk.to === Number.MAX_SAFE_INTEGER ? 'open' : day(chunk.to);
  return `${day(chunk.from)} -> ${to}`;
}

async function chunkPlan(
  client: Client,
  index: string,
  maxDocsPerChunk: number
): Promise<RewriteChunk[]> {
  const response = await withRetry('chunk plan search', () =>
    client.search({
      index,
      body: {
        size: 0,
        query: { bool: { must_not: { exists: { field: DONE_MARKER_FIELD } } } },
        aggs: {
          months: {
            date_histogram: {
              field: 'sent_at_millis',
              calendar_interval: 'month',
              min_doc_count: 1,
            },
          },
        },
      },
    })
  );
  const buckets = (response.body.aggregations?.months?.buckets ??
    []) as HistogramBucket[];
  const chunks = planChunks(buckets, maxDocsPerChunk);

  // Docs with no sent_at_millis match none of the ranges above.
  const undated = { kind: 'undated' as const, docs: 0 };
  const undatedCount = await withRetry('undated count', () =>
    client.count({ index, body: { query: chunkQuery(undated) } })
  );
  if (undatedCount.body.count > 0) {
    chunks.push({ kind: 'undated', docs: undatedCount.body.count });
  }
  return chunks;
}

async function pollTask(client: Client, taskId: string, label: string) {
  for (;;) {
    const response = await withRetry(`${label} tasks.get`, () =>
      client.tasks.get({ task_id: taskId })
    );
    if (response.body.completed) {
      const result = response.body.response ?? {};
      console.log(
        `  ${label}: updated ${result.updated}, conflicts ${result.version_conflicts}, failures ${(result.failures ?? []).length}, ${Math.round((result.took ?? 0) / 1000)}s`
      );
      if ((result.failures ?? []).length > 0) {
        throw new Error(
          `${label} reported failures: ${JSON.stringify(result.failures.slice(0, 3))}`
        );
      }
      return;
    }
    // A sliced task reports zeroes on the parent until it finishes, so read
    // progress off the child slice tasks.
    const children = await withRetry(`${label} tasks.list`, () =>
      client.tasks.list({ parent_task_id: taskId, detailed: true })
    );
    let updated = 0;
    let total = 0;
    for (const node of Object.values(children.body.nodes ?? {})) {
      for (const task of Object.values(
        (node as { tasks: Record<string, { status?: Record<string, number> }> })
          .tasks ?? {}
      )) {
        updated += task.status?.updated ?? 0;
        total += task.status?.total ?? 0;
      }
    }
    console.log(`  ${label}: ${updated}/${total}`);
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
}

async function settleDisk(
  client: Client,
  minFree: number,
  timeoutMinutes: number
) {
  const deadline = Date.now() + timeoutMinutes * 60_000;
  for (;;) {
    const free = await minFreeBytes(client);
    if (free >= minFree) return free;
    if (Date.now() > deadline) {
      throw new Error(
        `free disk still ${(free / GB).toFixed(1)}gb after ${timeoutMinutes}m — ` +
          `merges are not keeping up. Reclaim space (force-merge with ` +
          `only_expunge_deletes, or grow the volumes) before continuing.`
      );
    }
    console.log(
      `  waiting for merges: free ${(free / GB).toFixed(1)}gb < ${(minFree / GB).toFixed(0)}gb floor`
    );
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}

async function runRewrite(client: Client, index: string) {
  const maxDocsPerChunk = Number(process.env.MAX_DOCS_PER_CHUNK ?? 2_000_000);
  const requestsPerSecond = Number(process.env.REQUESTS_PER_SECOND ?? 2000);
  const minFree = Number(process.env.MIN_FREE_GB ?? 40) * GB;
  const settleTimeout = Number(process.env.SETTLE_TIMEOUT_MINUTES ?? 30);

  // A rewrite left running by an interrupted invocation. Drain it before
  // planning, so the plan reflects the work it lands and we never run two
  // passes over the same docs at once.
  if (!IS_DRY_RUN) {
    const inFlight = await findRunningRewriteTask(client, index);
    if (inFlight) {
      console.log(`attaching to in-flight rewrite task ${inFlight}`);
      await pollTask(client, inFlight, 'in-flight chunk');
    }
  }

  const order = process.env.ORDER === 'oldest' ? 'oldest' : 'newest';

  const chunks = orderChunks(
    await chunkPlan(client, index, maxDocsPerChunk),
    order
  );
  const outstanding = chunks.reduce((sum, chunk) => sum + chunk.docs, 0);
  console.log(`\n== rewrite phase on ${index} ==`);
  console.log(
    `${outstanding} docs still lack ${DONE_MARKER_FIELD}, in ${chunks.length} chunk(s), ` +
      `${order}-first, ${requestsPerSecond} docs/s, ${(minFree / GB).toFixed(0)}gb free-disk floor`
  );
  for (const [i, chunk] of chunks.entries()) {
    console.log(
      `  chunk ${i + 1}/${chunks.length}: ${chunkLabel(chunk)} (~${chunk.docs} docs)`
    );
  }

  if (IS_DRY_RUN) {
    console.log(
      '\n[DRY-RUN] No documents rewritten. Set DRY_RUN=false to apply.'
    );
    return;
  }
  if (chunks.length === 0) {
    console.log('nothing to do');
    return;
  }

  for (const [i, chunk] of chunks.entries()) {
    const label = `chunk ${i + 1}/${chunks.length} (${chunkLabel(chunk)})`;
    const free = await settleDisk(client, minFree, settleTimeout);
    console.log(`${label}: free disk ${(free / GB).toFixed(1)}gb, starting`);

    const response = await client.updateByQuery({
      index,
      conflicts: 'proceed',
      wait_for_completion: false,
      slices: 'auto',
      requests_per_second: requestsPerSecond,
      body: { query: chunkQuery(chunk) },
    });
    await pollTask(client, response.body.task, label);
  }

  console.log('\ndone — run PHASE=verify to confirm');
}

async function runVerify(client: Client, index: string) {
  console.log(`\n== verify phase on ${index} ==`);
  const count = async (body: Record<string, unknown>) =>
    (await withRetry('count', () => client.count({ index, body }))).body.count;

  const total = await count({ query: { match_all: {} } });
  const withParts = await count({
    query: { exists: { field: DONE_MARKER_FIELD } },
  });
  console.log(`  docs: ${total}`);
  console.log(`  with ${DONE_MARKER_FIELD}: ${withParts}`);
  console.log(`  remaining: ${total - withParts}`);
}

async function main() {
  await import('dotenv').then((m) => m.config());
  const { client } = await import('../client');
  const opensearchClient = client();

  const alias = process.env.ALIAS ?? 'emails';
  const index = await physicalIndexBehindAlias(opensearchClient, alias);
  console.log(
    `alias "${alias}" -> ${index} ${IS_DRY_RUN ? '(DRY-RUN MODE — set DRY_RUN=false to apply)' : '(LIVE MODE)'}`
  );

  switch (process.env.PHASE) {
    case 'mapping':
      return runMapping(opensearchClient, index);
    case 'rewrite':
      return runRewrite(opensearchClient, index);
    case 'verify':
      return runVerify(opensearchClient, index);
    default:
      console.error('Set PHASE to one of: mapping, rewrite, verify');
      process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('Error', err);
    process.exit(1);
  });
}
