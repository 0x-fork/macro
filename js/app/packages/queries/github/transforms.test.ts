import { describe, expect, it } from 'vitest';
import {
  matchesGithubPullRequestSearch,
  transformGithubPullRequestDetail,
  transformGithubPullRequestSummary,
  type GithubPullRequestDetailResponse,
  type GithubPullRequestSummaryResponse,
} from './transforms';

const summaryFixture: GithubPullRequestSummaryResponse = {
  id: 'macro-inc:macro:42',
  number: 42,
  title: 'Ship block-pr',
  repo_owner: 'macro-inc',
  repo_name: 'macro',
  repo_full_name: 'macro-inc/macro',
  state: 'open',
  comment_count: 3,
  html_url: 'https://github.com/macro-inc/macro/pull/42',
  created_at: '2026-03-19T12:00:00Z',
  updated_at: '2026-03-20T12:00:00Z',
  author_login: 'jacob',
  author_avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
};

describe('transformGithubPullRequestSummary', () => {
  it('maps the API payload into a PR entity', () => {
    const entity = transformGithubPullRequestSummary(summaryFixture);

    expect(entity).toMatchObject({
      id: 'macro-inc:macro:42',
      type: 'pr',
      name: 'Ship block-pr',
      repoFullName: 'macro-inc/macro',
      state: 'open',
      commentCount: 3,
      authorLogin: 'jacob',
    });
    expect(entity.viewedAt).toBe(summaryFixture.updated_at);
  });
});

describe('transformGithubPullRequestDetail', () => {
  it('normalizes merged PR metadata and timeline comments', () => {
    const detail = transformGithubPullRequestDetail({
      ...summaryFixture,
      state: 'merged',
      raw_state: 'closed',
      is_draft: false,
      body: 'PR body',
      closed_at: '2026-03-20T13:00:00Z',
      merged_at: '2026-03-20T13:00:00Z',
      base_branch: 'main',
      head_branch: 'jacob/block-pr',
      additions: 120,
      deletions: 18,
      changed_files: 7,
      commits: 4,
      issue_comment_count: 2,
      review_comment_count: 5,
      requested_reviewers: ['teo'],
      labels: ['frontend', 'github'],
      comments: [
        {
          kind: 'review_comment',
          id: 9,
          author_login: 'teo',
          author_avatar_url: null,
          author_association: 'MEMBER',
          body: 'Please rename this.',
          created_at: '2026-03-20T12:30:00Z',
          html_url: 'https://github.com/macro-inc/macro/pull/42#discussion_r1',
          path: 'foo.ts',
          line: 10,
          diff_hunk: '@@ -1 +1 @@',
        },
      ],
    } satisfies GithubPullRequestDetailResponse);

    expect(detail.state).toBe('merged');
    expect(detail.rawState).toBe('closed');
    expect(detail.commentCount).toBe(7);
    expect(detail.comments[0]).toMatchObject({
      kind: 'review_comment',
      authorLogin: 'teo',
      diffHunk: '@@ -1 +1 @@',
    });
  });
});

describe('matchesGithubPullRequestSearch', () => {
  const entity = transformGithubPullRequestSummary(summaryFixture);

  it('matches title, repo, author, and PR number', () => {
    expect(matchesGithubPullRequestSearch(entity, 'block-pr')).toBe(true);
    expect(matchesGithubPullRequestSearch(entity, 'macro-inc/macro')).toBe(
      true
    );
    expect(matchesGithubPullRequestSearch(entity, '#42')).toBe(true);
    expect(matchesGithubPullRequestSearch(entity, 'jacob')).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(matchesGithubPullRequestSearch(entity, 'unrelated')).toBe(false);
  });
});
