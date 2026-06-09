import type { GithubPullRequestEntity } from '@entity';
import type { GithubPullRequest } from '@service-storage/generated/schemas';

/**
 * The normalized pull request metadata used throughout the PR block. Mirrors
 * the shape produced by the Soup transform so the block and the list view stay
 * in sync.
 */
export type PullRequestMetadata = GithubPullRequestEntity['metadata'];
export type PullRequestStatus = PullRequestMetadata['status'];

/**
 * Normalize the raw `foreign_entity.metadata` JSON (stored in the
 * `GithubPullRequest` shape) into the strongly typed metadata the block
 * renders. Returns `null` when the payload is not a recognizable pull request.
 */
export function normalizePullRequestMetadata(
  raw: unknown
): PullRequestMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Partial<GithubPullRequest>;
  if (typeof m.number !== 'number' || !m.owner || !m.repo || !m.url) {
    return null;
  }

  let status: PullRequestStatus = 'open';
  if (m.status === 'merged') {
    status = 'merged';
  } else if (m.status === 'closed') {
    status = 'closed';
  }

  const displayName = m.displayName ?? `${m.owner}/${m.repo}#${m.number}`;

  return {
    number: m.number,
    name: m.name ?? displayName,
    owner: m.owner,
    repo: m.repo,
    url: m.url,
    status,
    additions: m.additions ?? 0,
    deletions: m.deletions ?? 0,
    comments: m.comments ?? [],
    checks: (m.checks ?? []).filter(Boolean),
  };
}

/** Display label and badge styling for each pull request status. */
export const PR_STATUS_META: Record<
  PullRequestStatus,
  { label: string; badgeClass: string }
> = {
  open: { label: 'Open', badgeClass: 'bg-success-bg text-success' },
  merged: { label: 'Merged', badgeClass: 'bg-accent-bg text-accent' },
  closed: { label: 'Closed', badgeClass: 'bg-failure/12 text-failure' },
};

/** Whether the pull request reports any line changes. */
export function hasLineChanges(metadata: PullRequestMetadata): boolean {
  return metadata.additions > 0 || metadata.deletions > 0;
}

/**
 * Lightly sanitize GitHub comment markdown for our renderer: drop HTML comments
 * and unwrap a few structural HTML tags (e.g. `<details>`/`<summary>`) that
 * GitHub renders but our markdown renderer doesn't, so they don't show up as
 * literal tags. Fenced code blocks are left untouched so code examples stay
 * intact.
 */
export function sanitizeCommentMarkdown(body: string): string {
  const stripHtml = (segment: string): string =>
    segment
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(
        /<\/?(?:details|summary|div|span|picture|source|sub|sup|kbd|img)\b[^>]*>/gi,
        ''
      );

  return body
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) => (index % 2 === 1 ? part : stripHtml(part)))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
