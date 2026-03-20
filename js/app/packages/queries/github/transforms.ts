import type { PrEntity } from '@entity';

export type GithubPullRequestState = PrEntity['state'];

export type GithubPullRequestSummaryResponse = {
  id: string;
  number: number;
  title: string;
  repo_owner: string;
  repo_name: string;
  repo_full_name: string;
  state: string;
  comment_count: number;
  html_url: string;
  created_at: string;
  updated_at: string;
  author_login: string;
  author_avatar_url?: string | null;
};

type GithubIssueCommentResponse = {
  kind: 'issue_comment';
  id: number;
  author_login: string;
  author_avatar_url?: string | null;
  author_association?: string | null;
  body: string;
  created_at: string;
  html_url: string;
};

type GithubReviewResponse = {
  kind: 'review';
  id: number;
  author_login: string;
  author_avatar_url?: string | null;
  state: string;
  body?: string | null;
  created_at: string;
  html_url: string;
};

type GithubReviewCommentResponse = {
  kind: 'review_comment';
  id: number;
  author_login: string;
  author_avatar_url?: string | null;
  author_association?: string | null;
  body: string;
  created_at: string;
  html_url: string;
  path?: string | null;
  line?: number | null;
  diff_hunk?: string | null;
};

export type GithubPullRequestCommentResponse =
  | GithubIssueCommentResponse
  | GithubReviewResponse
  | GithubReviewCommentResponse;

export type GithubPullRequestDetailResponse = GithubPullRequestSummaryResponse & {
  raw_state: string;
  is_draft: boolean;
  body?: string | null;
  closed_at?: string | null;
  merged_at?: string | null;
  base_branch: string;
  head_branch: string;
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  issue_comment_count: number;
  review_comment_count: number;
  requested_reviewers: string[];
  labels: string[];
  comments: GithubPullRequestCommentResponse[];
};

export type GithubPullRequestComment =
  | {
      kind: 'issue_comment';
      id: number;
      authorLogin: string;
      authorAvatarUrl?: string | null;
      authorAssociation?: string | null;
      body: string;
      createdAt: string;
      htmlUrl: string;
    }
  | {
      kind: 'review';
      id: number;
      authorLogin: string;
      authorAvatarUrl?: string | null;
      state: string;
      body?: string | null;
      createdAt: string;
      htmlUrl: string;
    }
  | {
      kind: 'review_comment';
      id: number;
      authorLogin: string;
      authorAvatarUrl?: string | null;
      authorAssociation?: string | null;
      body: string;
      createdAt: string;
      htmlUrl: string;
      path?: string | null;
      line?: number | null;
      diffHunk?: string | null;
    };

export type GithubPullRequestDetailData = Omit<PrEntity, 'commentCount'> & {
  rawState: string;
  body?: string | null;
  closedAt?: string | null;
  mergedAt?: string | null;
  baseBranch: string;
  headBranch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  issueCommentCount: number;
  reviewCommentCount: number;
  commentCount: number;
  requestedReviewers: string[];
  labels: string[];
  comments: GithubPullRequestComment[];
};

function normalizePullRequestState(state: string): GithubPullRequestState {
  if (state === 'merged') return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

export function transformGithubPullRequestSummary(
  summary: GithubPullRequestSummaryResponse
): PrEntity {
  return {
    id: summary.id,
    type: 'pr',
    name: summary.title,
    ownerId: summary.author_login,
    number: summary.number,
    repoOwner: summary.repo_owner,
    repoName: summary.repo_name,
    repoFullName: summary.repo_full_name,
    state: normalizePullRequestState(summary.state),
    commentCount: summary.comment_count,
    htmlUrl: summary.html_url,
    authorLogin: summary.author_login,
    authorAvatarUrl: summary.author_avatar_url,
    createdAt: summary.created_at,
    updatedAt: summary.updated_at,
    viewedAt: summary.updated_at,
  };
}

function transformGithubPullRequestComment(
  comment: GithubPullRequestCommentResponse
): GithubPullRequestComment {
  switch (comment.kind) {
    case 'issue_comment':
      return {
        kind: 'issue_comment',
        id: comment.id,
        authorLogin: comment.author_login,
        authorAvatarUrl: comment.author_avatar_url,
        authorAssociation: comment.author_association,
        body: comment.body,
        createdAt: comment.created_at,
        htmlUrl: comment.html_url,
      };
    case 'review':
      return {
        kind: 'review',
        id: comment.id,
        authorLogin: comment.author_login,
        authorAvatarUrl: comment.author_avatar_url,
        state: comment.state,
        body: comment.body,
        createdAt: comment.created_at,
        htmlUrl: comment.html_url,
      };
    case 'review_comment':
      return {
        kind: 'review_comment',
        id: comment.id,
        authorLogin: comment.author_login,
        authorAvatarUrl: comment.author_avatar_url,
        authorAssociation: comment.author_association,
        body: comment.body,
        createdAt: comment.created_at,
        htmlUrl: comment.html_url,
        path: comment.path,
        line: comment.line,
        diffHunk: comment.diff_hunk,
      };
  }
}

export function transformGithubPullRequestDetail(
  detail: GithubPullRequestDetailResponse
): GithubPullRequestDetailData {
  const summary = transformGithubPullRequestSummary(detail);

  return {
    ...summary,
    isDraft: detail.is_draft,
    state: normalizePullRequestState(detail.state),
    rawState: detail.raw_state,
    body: detail.body,
    closedAt: detail.closed_at,
    mergedAt: detail.merged_at,
    baseBranch: detail.base_branch,
    headBranch: detail.head_branch,
    additions: detail.additions,
    deletions: detail.deletions,
    changedFiles: detail.changed_files,
    commits: detail.commits,
    issueCommentCount: detail.issue_comment_count,
    reviewCommentCount: detail.review_comment_count,
    commentCount: detail.issue_comment_count + detail.review_comment_count,
    requestedReviewers: detail.requested_reviewers,
    labels: detail.labels,
    comments: detail.comments.map(transformGithubPullRequestComment),
  };
}

export function matchesGithubPullRequestSearch(
  pullRequest: PrEntity,
  query: string
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [
    pullRequest.name,
    pullRequest.repoFullName,
    pullRequest.repoName,
    pullRequest.repoOwner,
    pullRequest.authorLogin,
    pullRequest.state,
    `${pullRequest.number}`,
    `#${pullRequest.number}`,
    `${pullRequest.repoFullName}#${pullRequest.number}`,
  ].some((value) => value.toLowerCase().includes(normalized));
}
