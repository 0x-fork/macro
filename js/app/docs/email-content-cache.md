# Email content cache & sync engine

The email content cache makes opening a thread instant: thread content is
synced ahead of time into a durable IndexedDB store and served synchronously
into the TanStack query cache when a thread is opened. A light delta-sync
loop, woken by websocket activity, keeps the store current.

This is the first instance of a pattern we intend to reuse for other content
types (e.g. channels): a **watermark-based delta feed** on the backend plus a
**two-layer client cache** (L1 = TanStack in memory, L2 = IndexedDB on disk)
driven by a small sync engine.

```
  websocket events ──▶ ┌──────────────────────────────────────────────┐
  (refresh_email)      │ email sync engine (one per tab)              │
  reconnect/visibility │  wake → GET /email/threads/delta?since=…     │
  periodic fallback    │       → record digests as *pending* (L2 meta)│
                       │       → hydration queue (capped, newest 1st) │
                       │       → GET /email/threads/{id} per thread   │
                       └───────────────┬──────────────────────────────┘
                                       │ guarded writes
                                       ▼
                               ┌──────────────┐   seed on open   ┌─────────────┐
                               │ IndexedDB L2 │─────────────────▶│ TanStack L1 │
                               │ (durable)    │                  │ (in memory) │
                               └──────────────┘                  └─────────────┘
```

Design rules that keep this easy to reason about:

- **L2 has exactly one writer class**: engine hydrations plus a handful of
  explicit mutation hooks (evict/patch). There is no generic
  query-cache→IDB writeback.
- **The engine never touches a query that has active observers.** Open
  threads keep being refreshed by the existing notification-driven
  invalidation; the engine only makes the *next* open instant.
- **L2 is a cache, not a source of truth.** Anything suspicious is evicted
  and the open falls back to today's network path.

## Backend: the watermark and the delta feed

`email_threads.updated_at` is the authoritative *content watermark* for a
thread: every mutation that changes what `GET /email/threads/{id}` returns
bumps it in the same transaction. Message ingest/delete and draft upserts
already did; label add/remove and read/star batch mutations now bump the
parent threads too (previously they touched only `email_message_labels` /
`email_messages`, making e.g. trash-from-list invisible to any watermark —
this also gets those changes into search reindexing, which keys off the same
column).

`GET /email/threads/delta?since=<rfc3339>&order=asc|desc&cursor=…&limit=…`
(`rust/cloud-storage/email/src/inbound/axum/delta_router.rs`) returns
digests — `{ thread_id, link_id, watermark }` — for every thread in the
caller's inboxes (own + delegated) whose watermark is at or after `since`,
keyset-paginated by `(watermark, thread_id)`. The query is a bounded
index-only scan per link (`LATERAL` over the caller's links against
`idx_email_threads_link_id_updated_at`), so each page costs O(links × limit)
regardless of mailbox size. `since` is clamped server-side to a 90-day
horizon. `order=desc` exists for bootstrap: "the N most recently changed
threads" is one page, not a full-feed enumeration.

Digests deliberately carry no content. The feed answers "*what* changed
since when"; hydration reuses the existing `GET /email/threads/{id}`
endpoint, so payload shape, ACLs, and draft handling stay on one battle-tested
path, and backpressure lives client-side.

The steady-state `refresh_email` events (`upsert_message`, `update_labels`,
`delete_message`) now carry an optional `thread_id` for targeted hydration;
the delta feed remains the correctness backstop for anything events miss
(offline gaps, deploy skew, multi-thread sweeps).

## Frontend: two-layer cache

Code lives in `js/app/packages/queries/email/content-cache/`; the delta
network call lives in `service-email/client.ts` like every other API call.

### `store.ts` — L2

An `idb`-backed database (`email-content-cache-v1`) with two object stores:

- `threads`: the exact `InfiniteData<ApiThread>` shape the thread query
  caches (first page, 20 messages — the same page the UI requests), so
  seeding is a verbatim `setQueryData`.
- `meta`: per-thread digests `{threadId, linkId, watermark, state,
  hasDrafts, cachedAt, size, attempts}` plus the sync cursor and a store
  `generation`.

Writes are guarded compare-and-swaps inside one transaction spanning both
stores: a write commits only if the store generation is unchanged (wiped on
user switch — an in-flight hydration from the previous user can never land),
the thread's eviction epoch predates the hydration start (a draft save
mid-hydration can't be resurrected by the older response), and the incoming
watermark is not older than the stored one. Watermarks are stored and
compared as microsecond-normalized RFC3339 *strings* — `Date` parsing
truncates Postgres microseconds and would drop same-millisecond changes.

Retention is independent of TanStack GC (the legacy per-query persistence
deleted entries whenever a query was GC'd): entries are pruned by age (7d),
count (1500), and a byte budget (50MB, largest-oldest first), with sizes
tracked in `meta`. `navigator.storage.persist()` is requested at engine
start. The legacy `email-threads-persist-v1` scope is bypassed under the
flag and its database deleted on first engine start.

### `engine.ts` — the sync loop

One engine per tab (no leader election: the delta call is cheap,
concurrent hydrations are deduped by the watermark CAS, and per-tab engines
mean every tab keeps its own reactivity). Started reactively from
`QuerySyncProvider` once a user id exists, with a jittered delay.

The single primitive is `deltaSync()`:

1. Request delta pages `since = lastWatermark − 60s` (overlap absorbs
   commit-time skew).
2. Drop digests whose watermark is **strictly less** than the locally
   cached one. Equal watermarks re-hydrate — a transaction that committed
   *after* we hydrated can carry the same watermark as one we saw (NOW() is
   transaction start time), so equality proves nothing.
3. Persist surviving digests as `pending` and advance the cursor in the
   same IDB transaction — a crash never strands a digest beyond the cursor.
4. Hydrate pending digests newest-first through a queue capped at
   2 concurrent (1 when the tab is hidden), 50 per cycle. Success flips the
   digest to `hydrated`; 404/410/403 evicts; other failures retry up to 5
   times across wakes.

Wake sources: engine start (resume pending first), `refresh_email`
steady-state events (2s trailing debounce, 10s max wait, single-flight with
a dirty flag), targeted `thread_id` events (straight to the hydration
queue), websocket reconnect, visibility→visible, and a 10-minute fallback
tick. While a link is backfilling (`backfill_progress` events / `SYNCING`
links) the engine pauses for it; on completion it re-bootstraps.

Bootstrap (first run): one `order=desc` page over a 30-day window,
hydrating at most 300 threads (drained gradually under the per-cycle cap).
Deeper history is simply not pre-cached.

Deletes are physical and carry no digests. Targeted `delete_message`
events evict the exact thread (a re-hydration 404 confirms full deletion);
events without a `thread_id` downgrade the link's entries to `pending`
(never served-as-fresh) and re-hydrate the most recent 100. Everything else
ages out.

### L1 integration — the open path

`fetchAndCacheThread` (the email block's single load path) seeds from L2
before falling back to the network, but only serves the seed as the result
when it is **provably current**: the entry is `hydrated` (not pending), has
no drafts, and *this session's* engine completed a sync recently (a previous
session's sync proves nothing about changes that happened while the app was
closed). Then the query is seeded fresh and the open completes with zero
network on the critical path.
In every other case the open awaits the network exactly as today — except
that a network *failure* with a seeded entry returns the cached thread
instead of an error (offline reads). The seed always aborts if the query
already has data or a fetch in flight.

Threads containing drafts are never served from cache (`hasDrafts`): drafts
are edited cross-device with no reliable wake signal, and a stale draft body
that the 500ms autosave then overwrites is data loss. Such opens hit the
network, as they do today.

### Consistency hooks

- **Draft save/delete** and **send** bump the thread's eviction epoch and
  evict its L2 entry (mirroring the existing "drop the query on unmount
  after a draft save" behavior).
- **Archive** patches the L2 entry's `inbox_visible` in place (matching the
  optimistic L1 update).
- **`link_removed`** and engine start's readable-link check evict entries
  for links the user can no longer read.
- **Any** `getThread` 404/410 — engine or open path — evicts.

## Feature flag

`ENABLE_EMAIL_CONTENT_SYNC` (`packages/core/constant/featureFlags.ts`,
build-time, default: dev on / prod off). Off: the engine never starts,
`fetchAndCacheThread` behaves exactly as before, and the legacy per-query
persistence scope stays active. Build-time evaluation is required because
the legacy scope bypass happens at module load of the query client.

## Scaling this to other content types

The pattern is content-agnostic: a `(id, scope_id, watermark)` delta feed
over an authoritative per-entity watermark column, digest-diff against a
local meta store, a capped hydration queue over the type's existing "get
content" endpoint, and seed-on-open gated by provable currency. The store
and queue in `content-cache/` keep the email-specific parts (endpoints,
query keys, eviction hooks) at the edges.
