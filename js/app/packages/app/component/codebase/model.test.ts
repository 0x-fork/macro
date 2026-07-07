import type { GithubPullRequestEntity, TaskEntity } from '@entity/types/entity';
import { PROPERTY_OPTION_IDS, SYSTEM_PROPERTY_IDS } from '@property/constants';
import { describe, expect, it } from 'vitest';
import {
  type AttentionNotificationLike,
  averageOpenAgeDays,
  buildEngineerBentos,
  buildEngineerDigests,
  buildTeamActivityDigest,
  computeContributorLeaderboard,
  computeCycleTimeByAuthor,
  computePrStats,
  computeRepoBreakdown,
  computeReviewAttention,
  computeWeeklyChurn,
  computeWeeklyPrActivity,
  computeWeeklyVelocity,
  countStalePullRequests,
  countTasksByStatus,
  detectPullRequestArea,
  groupPullRequests,
  groupPullRequestsByAuthor,
  groupTasksByAssignee,
  groupTasksByProject,
  hasFailingChecks,
  matchContactForLogin,
  matchesPrStatusFilter,
  medianTimeToMergeDays,
  pullRequestDisplayStatus,
  pullRequestGithubKey,
  pullRequestSizeBucket,
} from './model';

type PullRequestOverrides = Omit<
  Partial<GithubPullRequestEntity>,
  'metadata'
> & {
  metadata?: Partial<GithubPullRequestEntity['metadata']>;
};

function makePullRequest(
  overrides: PullRequestOverrides = {}
): GithubPullRequestEntity {
  const { metadata, ...rest } = overrides;
  return {
    type: 'foreign',
    id: 'pr-1',
    name: 'Add feature',
    ownerId: 'user-1',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-02T00:00:00Z',
    foreignSource: 'github_pull_request',
    foreignId: 'macro-inc/macro/pull/1',
    storedForId: 'user-1',
    storedForAuthEntity: 'team',
    ...rest,
    metadata: {
      number: 1,
      name: 'Add feature',
      owner: 'macro-inc',
      repo: 'macro',
      url: 'https://github.com/macro-inc/macro/pull/1',
      status: 'open',
      additions: 1,
      deletions: 1,
      comments: [],
      checks: [],
      ...metadata,
    },
  };
}

function makeTask(
  overrides: Partial<TaskEntity> & { statusOptionId?: string } = {}
): TaskEntity {
  const { statusOptionId, ...rest } = overrides;
  const task = {
    type: 'document' as const,
    id: 'task-1',
    name: 'Do a thing',
    ownerId: 'user-1',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-02T00:00:00Z',
    fileType: 'md' as const,
    subType: { type: 'task' as const, is_completed: false },
    ...rest,
  };
  if (statusOptionId) {
    return {
      ...task,
      properties: [
        {
          definition: { id: SYSTEM_PROPERTY_IDS.STATUS },
          value: { type: 'SelectOption', value: [statusOptionId] },
        },
      ],
    } as TaskEntity;
  }
  return task as TaskEntity;
}

describe('pullRequestDisplayStatus', () => {
  it('maps stored statuses through directly', () => {
    expect(
      pullRequestDisplayStatus(
        makePullRequest({ metadata: { status: 'merged' } })
      )
    ).toBe('merged');
    expect(
      pullRequestDisplayStatus(
        makePullRequest({ metadata: { status: 'closed' } })
      )
    ).toBe('closed');
    expect(pullRequestDisplayStatus(makePullRequest())).toBe('open');
  });

  it('reports draft only for open PRs with the enrichment flag', () => {
    expect(
      pullRequestDisplayStatus(
        makePullRequest({ metadata: { status: 'open', draft: true } })
      )
    ).toBe('draft');
    expect(
      pullRequestDisplayStatus(
        makePullRequest({ metadata: { status: 'merged', draft: true } })
      )
    ).toBe('merged');
  });
});

describe('matchesPrStatusFilter', () => {
  it('matches everything for "all"', () => {
    expect(matchesPrStatusFilter(makePullRequest(), 'all')).toBe(true);
  });

  it('excludes drafts from the open filter', () => {
    const draft = makePullRequest({
      metadata: { status: 'open', draft: true },
    });
    expect(matchesPrStatusFilter(draft, 'open')).toBe(false);
    expect(matchesPrStatusFilter(draft, 'draft')).toBe(true);
  });
});

describe('pullRequestGithubKey', () => {
  it('builds the stored owner/repo/pull/number association key', () => {
    expect(
      pullRequestGithubKey(
        makePullRequest({
          metadata: { owner: 'macro-inc', repo: 'macro', number: 42 },
        })
      )
    ).toBe('macro-inc/macro/pull/42');
  });
});

describe('groupPullRequestsByAuthor', () => {
  it('groups by author login and sorts by open count', () => {
    const groups = groupPullRequestsByAuthor([
      makePullRequest({
        id: 'a',
        metadata: { authorLogin: 'alice', status: 'merged' },
      }),
      makePullRequest({
        id: 'b',
        metadata: { authorLogin: 'bob', status: 'open' },
      }),
      makePullRequest({
        id: 'c',
        metadata: { authorLogin: 'alice', status: 'closed' },
      }),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['bob', 'alice']);
    expect(groups[1].pullRequests.map((pr) => pr.id)).toEqual(['a', 'c']);
    expect(groups[0].openCount).toBe(1);
  });

  it('buckets missing authors under the unknown key', () => {
    const groups = groupPullRequestsByAuthor([makePullRequest()]);
    expect(groups[0].key).toBe('unknown');
    expect(groups[0].authorLogin).toBeUndefined();
  });
});

describe('groupTasksByProject', () => {
  it('groups by project with names, ungrouped tasks last', () => {
    const groups = groupTasksByProject(
      [
        makeTask({ id: 't1' }),
        makeTask({ id: 't2', projectId: 'p2' }),
        makeTask({
          id: 't3',
          projectId: 'p1',
          subType: { type: 'task', is_completed: true },
        }),
      ],
      new Map([
        ['p1', 'Alpha'],
        ['p2', 'Beta'],
      ])
    );

    expect(groups.map((g) => g.name)).toEqual(['Alpha', 'Beta', 'No project']);
    expect(groups[0].openCount).toBe(0);
    expect(groups[1].openCount).toBe(1);
  });
});

describe('computeWeeklyPrActivity', () => {
  it('buckets opens and merges into trailing weeks', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    const weeks = computeWeeklyPrActivity(
      [
        makePullRequest({
          id: 'recent',
          createdAt: '2026-07-06T01:00:00Z',
          updatedAt: '2026-07-06T02:00:00Z',
          metadata: { status: 'merged' },
        }),
        makePullRequest({
          id: 'older',
          createdAt: '2026-06-24T00:00:00Z',
        }),
        makePullRequest({
          id: 'ancient',
          createdAt: '2020-01-01T00:00:00Z',
        }),
      ],
      8,
      now
    );

    expect(weeks).toHaveLength(8);
    const last = weeks[weeks.length - 1];
    expect(last.opened).toBe(1);
    expect(last.merged).toBe(1);
    expect(weeks.reduce((sum, w) => sum + w.opened, 0)).toBe(2);
  });
});

describe('countTasksByStatus', () => {
  it('counts recognized statuses and falls back to completion state', () => {
    const counts = countTasksByStatus([
      makeTask({
        id: 't1',
        statusOptionId: PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS,
      }),
      makeTask({ id: 't2' }),
      makeTask({ id: 't3', subType: { type: 'task', is_completed: true } }),
    ]);

    expect(counts.get(PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS)).toBe(1);
    expect(counts.get(PROPERTY_OPTION_IDS.STATUS.NOT_STARTED)).toBe(1);
    expect(counts.get(PROPERTY_OPTION_IDS.STATUS.COMPLETED)).toBe(1);
  });
});

describe('computePrStats', () => {
  it('computes headline numbers with a 30-day merge window', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    const stats = computePrStats(
      [
        makePullRequest({ id: 'open' }),
        makePullRequest({
          id: 'draft',
          metadata: {
            draft: true,
            checks: [
              { id: 1, name: 'ci', status: 'completed', conclusion: 'failure' },
            ],
          },
        }),
        makePullRequest({
          id: 'merged-recent',
          updatedAt: '2026-07-01T00:00:00Z',
          metadata: { status: 'merged' },
        }),
        makePullRequest({
          id: 'merged-old',
          updatedAt: '2026-01-01T00:00:00Z',
          metadata: { status: 'merged' },
        }),
      ],
      now
    );

    expect(stats).toEqual({
      open: 1,
      draft: 1,
      mergedLast30Days: 1,
      failingChecks: 1,
    });
  });
});

describe('hasFailingChecks', () => {
  it('detects failing conclusions', () => {
    const failing = makePullRequest({
      metadata: {
        checks: [
          { id: 1, name: 'ci', status: 'completed', conclusion: 'failure' },
        ],
      },
    });
    const passing = makePullRequest({
      metadata: {
        checks: [
          { id: 1, name: 'ci', status: 'completed', conclusion: 'success' },
        ],
      },
    });
    expect(hasFailingChecks(failing)).toBe(true);
    expect(hasFailingChecks(passing)).toBe(false);
  });
});

describe('pullRequestSizeBucket', () => {
  it('buckets by total changed lines', () => {
    const bucketFor = (additions: number, deletions: number) =>
      pullRequestSizeBucket(
        makePullRequest({ metadata: { additions, deletions } })
      );
    expect(bucketFor(4, 5)).toBe('xs');
    expect(bucketFor(50, 40)).toBe('s');
    expect(bucketFor(300, 100)).toBe('m');
    expect(bucketFor(600, 300)).toBe('l');
    expect(bucketFor(2000, 0)).toBe('xl');
  });
});

describe('detectPullRequestArea', () => {
  it('classifies from title and repo keywords', () => {
    const areaFor = (name: string, repo = 'macro') =>
      detectPullRequestArea(makePullRequest({ metadata: { name, repo } }));
    expect(areaFor('fix(ui): sidebar layout glitch')).toBe('frontend');
    expect(areaFor('add sqlx migration for foreign entities')).toBe('backend');
    expect(areaFor('chore: bump docker base image')).toBe('infra');
    expect(areaFor('update README')).toBe('docs');
    expect(areaFor('miscellaneous change')).toBe('other');
  });

  it('prefers infra/docs keywords over broader area words', () => {
    expect(
      detectPullRequestArea(
        makePullRequest({ metadata: { name: 'ci: run ui tests on deploy' } })
      )
    ).toBe('infra');
  });
});

describe('computeWeeklyVelocity', () => {
  it('reports median cycle days for weeks with merges and gaps otherwise', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    const weeks = computeWeeklyVelocity(
      [
        makePullRequest({
          id: 'fast',
          createdAt: '2026-07-05T00:00:00Z',
          updatedAt: '2026-07-06T00:00:00Z',
          metadata: { status: 'merged' },
        }),
        makePullRequest({
          id: 'slow',
          createdAt: '2026-07-01T00:00:00Z',
          updatedAt: '2026-07-06T00:00:00Z',
          metadata: { status: 'merged' },
        }),
        makePullRequest({ id: 'open', createdAt: '2026-07-01T00:00:00Z' }),
      ],
      4,
      now
    );

    const last = weeks[weeks.length - 1];
    expect(last.mergedCount).toBe(2);
    expect(last.medianDays).toBe(3);
    expect(weeks[0].medianDays).toBeUndefined();
  });
});

describe('computeWeeklyChurn', () => {
  it('sums additions and deletions by merge week', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    const weeks = computeWeeklyChurn(
      [
        makePullRequest({
          id: 'a',
          updatedAt: '2026-07-06T00:00:00Z',
          metadata: { status: 'merged', additions: 100, deletions: 20 },
        }),
        makePullRequest({
          id: 'b',
          // Sunday July 5 lands in the previous Monday-based week.
          updatedAt: '2026-07-05T00:00:00Z',
          metadata: { status: 'merged', additions: 10, deletions: 5 },
        }),
        makePullRequest({
          id: 'open',
          metadata: { additions: 999, deletions: 999 },
        }),
      ],
      4,
      now
    );

    const last = weeks[weeks.length - 1];
    expect(last.additions).toBe(100);
    expect(last.deletions).toBe(20);
    const previous = weeks[weeks.length - 2];
    expect(previous.additions).toBe(10);
    expect(previous.deletions).toBe(5);
  });
});

describe('computeRepoBreakdown', () => {
  it('counts per repo by display status, largest repo first', () => {
    const rows = computeRepoBreakdown([
      makePullRequest({ id: 'a', metadata: { repo: 'macro' } }),
      makePullRequest({
        id: 'b',
        metadata: { repo: 'macro', status: 'merged' },
      }),
      makePullRequest({
        id: 'c',
        metadata: { repo: 'macro', status: 'closed' },
      }),
      makePullRequest({ id: 'd', metadata: { repo: 'pdf.js', draft: true } }),
    ]);

    expect(rows[0]).toEqual({
      repo: 'macro-inc/macro',
      open: 1,
      merged: 1,
      closed: 1,
      total: 3,
    });
    expect(rows[1].repo).toBe('macro-inc/pdf.js');
    expect(rows[1].open).toBe(1);
  });
});

describe('computeContributorLeaderboard', () => {
  it('ranks authors by PRs merged in the window', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    const rows = computeContributorLeaderboard(
      [
        makePullRequest({
          id: 'a',
          updatedAt: '2026-07-01T00:00:00Z',
          metadata: { status: 'merged', authorLogin: 'alice', additions: 10 },
        }),
        makePullRequest({
          id: 'b',
          updatedAt: '2026-07-02T00:00:00Z',
          metadata: { status: 'merged', authorLogin: 'alice' },
        }),
        makePullRequest({
          id: 'c',
          updatedAt: '2026-07-02T00:00:00Z',
          metadata: { status: 'merged', authorLogin: 'bob' },
        }),
        makePullRequest({
          id: 'too-old',
          updatedAt: '2026-01-01T00:00:00Z',
          metadata: { status: 'merged', authorLogin: 'bob' },
        }),
      ],
      30,
      now
    );

    expect(rows.map((r) => [r.key, r.merged])).toEqual([
      ['alice', 2],
      ['bob', 1],
    ]);
  });
});

describe('computeCycleTimeByAuthor', () => {
  it('collects per-author samples with medians, largest group first', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    const groups = computeCycleTimeByAuthor(
      [
        makePullRequest({
          id: 'a1',
          createdAt: '2026-07-01T00:00:00Z',
          updatedAt: '2026-07-03T00:00:00Z',
          metadata: { status: 'merged', authorLogin: 'alice' },
        }),
        makePullRequest({
          id: 'a2',
          createdAt: '2026-07-01T00:00:00Z',
          updatedAt: '2026-07-05T00:00:00Z',
          metadata: { status: 'merged', authorLogin: 'alice' },
        }),
        makePullRequest({
          id: 'b1',
          createdAt: '2026-07-01T00:00:00Z',
          updatedAt: '2026-07-02T00:00:00Z',
          metadata: { status: 'merged', authorLogin: 'bob' },
        }),
        makePullRequest({ id: 'open', metadata: { authorLogin: 'bob' } }),
      ],
      {},
      now
    );

    expect(groups.map((g) => g.key)).toEqual(['alice', 'bob']);
    expect(groups[0].samples).toEqual([2, 4]);
    expect(groups[0].medianDays).toBe(3);
    expect(groups[1].samples).toEqual([1]);
  });

  it('caps the number of groups', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    const groups = computeCycleTimeByAuthor(
      ['a', 'b', 'c'].map((login) =>
        makePullRequest({
          id: login,
          createdAt: '2026-07-01T00:00:00Z',
          updatedAt: '2026-07-02T00:00:00Z',
          metadata: { status: 'merged', authorLogin: login },
        })
      ),
      { maxGroups: 2 },
      now
    );
    expect(groups).toHaveLength(2);
  });
});

describe('stale + median helpers', () => {
  it('counts open PRs quiet for 7+ days', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    expect(
      countStalePullRequests(
        [
          makePullRequest({ id: 'stale', updatedAt: '2026-06-20T00:00:00Z' }),
          makePullRequest({ id: 'fresh', updatedAt: '2026-07-05T00:00:00Z' }),
          makePullRequest({
            id: 'merged',
            updatedAt: '2026-06-01T00:00:00Z',
            metadata: { status: 'merged' },
          }),
        ],
        7,
        now
      )
    ).toBe(1);
  });

  it('computes median time-to-merge over the window', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    expect(
      medianTimeToMergeDays(
        [
          makePullRequest({
            id: 'a',
            createdAt: '2026-07-01T00:00:00Z',
            updatedAt: '2026-07-03T00:00:00Z',
            metadata: { status: 'merged' },
          }),
          makePullRequest({
            id: 'b',
            createdAt: '2026-07-01T00:00:00Z',
            updatedAt: '2026-07-05T00:00:00Z',
            metadata: { status: 'merged' },
          }),
        ],
        30,
        now
      )
    ).toBe(3);
  });
});

describe('groupTasksByAssignee', () => {
  it('groups by assignee, multi-assignee tasks in each, unassigned separate', () => {
    const withAssignees = (id: string, userIds: string[]) =>
      ({
        ...makeTask({ id }),
        properties: [
          {
            definition: { id: SYSTEM_PROPERTY_IDS.ASSIGNEES },
            value: {
              type: 'EntityReference',
              value: userIds.map((entityId) => ({
                entity_type: 'USER',
                entity_id: entityId,
              })),
            },
          },
        ],
      }) as TaskEntity;

    const groups = groupTasksByAssignee([
      withAssignees('t1', ['u1']),
      withAssignees('t2', ['u1', 'u2']),
      makeTask({ id: 't3' }),
    ]);

    expect(groups.get('u1')?.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(groups.get('u2')?.map((t) => t.id)).toEqual(['t2']);
    expect(groups.get('unassigned')?.map((t) => t.id)).toEqual(['t3']);
  });
});

describe('matchContactForLogin', () => {
  const contacts = [
    { id: 'u1', name: 'Jacob Beckerman', email: 'jacob@macro.com' },
    { id: 'u2', name: 'Ada Lovelace', email: 'ada@macro.com' },
  ];

  it('matches email local-part and concatenated name exactly', () => {
    expect(matchContactForLogin('jacob', contacts)?.id).toBe('u1');
    expect(matchContactForLogin('AdaLovelace', contacts)?.id).toBe('u2');
  });

  it('matches first-initial+lastname prefixes of 5+ chars', () => {
    expect(matchContactForLogin('jbecke', contacts)?.id).toBe('u1');
    // Too short to trust as a prefix.
    expect(matchContactForLogin('jbec', contacts)).toBeUndefined();
    expect(matchContactForLogin('someoneelse', contacts)).toBeUndefined();
  });
});

describe('buildEngineerBentos', () => {
  const contacts = [
    { id: 'u1', name: 'Jacob Beckerman', email: 'jacob@macro.com' },
  ];
  const assigned = (id: string, userId: string) =>
    ({
      ...makeTask({ id }),
      properties: [
        {
          definition: { id: SYSTEM_PROPERTY_IDS.ASSIGNEES },
          value: {
            type: 'EntityReference',
            value: [{ entity_type: 'USER', entity_id: userId }],
          },
        },
      ],
    }) as TaskEntity;

  it('joins PR authors with matched assignees and appends unassigned last', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    const bentos = buildEngineerBentos(
      [
        makePullRequest({ id: 'p1', metadata: { authorLogin: 'jbecke' } }),
        makePullRequest({
          id: 'p2',
          updatedAt: '2026-07-01T00:00:00Z',
          metadata: { authorLogin: 'jbecke', status: 'merged' },
        }),
      ],
      [assigned('t1', 'u1'), makeTask({ id: 't2' })],
      contacts,
      {},
      now
    );

    expect(bentos).toHaveLength(2);
    expect(bentos[0].displayName).toBe('Jacob Beckerman');
    expect(bentos[0].githubLogin).toBe('jbecke');
    expect(bentos[0].openPullRequests.map((pr) => pr.id)).toEqual(['p1']);
    expect(bentos[0].openTasks.map((t) => t.id)).toEqual(['t1']);
    expect(bentos[0].mergedLast30Days).toBe(1);
    expect(bentos[1].key).toBe('unassigned');
    expect(bentos[1].openTasks.map((t) => t.id)).toEqual(['t2']);
  });

  it('gives unmatched assignees their own bento and skips completed tasks', () => {
    const bentos = buildEngineerBentos(
      [],
      [
        assigned('t1', 'u-unknown'),
        {
          ...assigned('t2', 'u-unknown'),
          subType: { type: 'task', is_completed: true },
        } as TaskEntity,
      ],
      contacts,
      {},
      new Date('2026-07-06T12:00:00Z')
    );

    expect(bentos).toHaveLength(1);
    expect(bentos[0].displayName).toBe('Unknown teammate');
    expect(bentos[0].openTasks.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('buildEngineerBentos team scoping', () => {
  const contacts = [
    { id: 'u1', name: 'Jacob Beckerman', email: 'jacob@macro.com' },
    { id: 'u2', name: 'Outside Collaborator', email: 'out@other.com' },
  ];
  const assigned = (id: string, userId: string) =>
    ({
      ...makeTask({ id }),
      properties: [
        {
          definition: { id: SYSTEM_PROPERTY_IDS.ASSIGNEES },
          value: {
            type: 'EntityReference',
            value: [{ entity_type: 'USER', entity_id: userId }],
          },
        },
      ],
    }) as TaskEntity;

  it('drops assignee-only bentos outside the team and narrows matching', () => {
    const bentos = buildEngineerBentos(
      [makePullRequest({ id: 'p1', metadata: { authorLogin: 'jbecke' } })],
      [assigned('t1', 'u1'), assigned('t2', 'u2')],
      contacts,
      { teamMemberIds: new Set(['u1']) },
      new Date('2026-07-06T12:00:00Z')
    );

    expect(bentos.map((b) => b.displayName)).toEqual(['Jacob Beckerman']);
    expect(bentos[0].openTasks.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('groupPullRequests', () => {
  const prs = [
    makePullRequest({
      id: 'a1',
      metadata: { authorLogin: 'alice', status: 'open' },
    }),
    makePullRequest({
      id: 'b1',
      metadata: { authorLogin: 'bob', status: 'merged', repo: 'other' },
    }),
    makePullRequest({
      id: 'a2',
      metadata: { authorLogin: 'alice', status: 'open', draft: true },
    }),
  ];

  it('groups by author with avatars-friendly metadata', () => {
    const groups = groupPullRequests(prs, 'pr_author');
    expect(groups.map((g) => g.key)).toEqual(['alice', 'bob']);
    expect(groups[0].authorLogin).toBe('alice');
    expect(groups[0].openCount).toBe(2);
  });

  it('groups by status in display order', () => {
    const groups = groupPullRequests(prs, 'pr_status');
    expect(groups.map((g) => g.key)).toEqual(['open', 'draft', 'merged']);
    expect(groups.map((g) => g.label)).toEqual(['Open', 'Draft', 'Merged']);
    expect(groups[2].openCount).toBe(0);
  });

  it('groups by repository, biggest first', () => {
    const groups = groupPullRequests(prs, 'pr_repository');
    expect(groups.map((g) => g.key)).toEqual([
      'macro-inc/macro',
      'macro-inc/other',
    ]);
    expect(groups[0].pullRequests.map((pr) => pr.id)).toEqual(['a1', 'a2']);
  });

  it('returns a single unlabeled group for none', () => {
    const groups = groupPullRequests(prs, 'none');
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('');
    expect(groups[0].pullRequests).toHaveLength(3);
    expect(groupPullRequests([], 'none')).toEqual([]);
  });
});

describe('computeReviewAttention', () => {
  const notification = (
    overrides: Partial<AttentionNotificationLike> & {
      content?: Record<string, unknown>;
      tag?: string;
    } = {}
  ): AttentionNotificationLike => {
    const { content, tag, ...rest } = overrides;
    return {
      id: 'n1',
      done: false,
      created_at: '2026-07-06T00:00:00Z',
      ...rest,
      notification_metadata: {
        tag: tag ?? 'github_review_requested',
        content: {
          githubKey: 'macro-inc/macro/pull/1',
          title: 'Add feature',
          owner: 'macro-inc',
          repo: 'macro',
          number: 1,
          url: 'https://github.com/macro-inc/macro/pull/1',
          senderGithubLogin: 'alice',
          ...content,
        },
      },
    };
  };

  it('keeps only not-done mention / review-request notifications', () => {
    const items = computeReviewAttention(
      [
        notification({ id: 'n1' }),
        notification({ id: 'n2', done: true }),
        notification({ id: 'n3', tag: 'github_pr_comment' }),
      ],
      []
    );
    expect(items).toHaveLength(1);
    expect(items[0].notificationIds).toEqual(['n1']);
    expect(items[0].reference).toBe('macro-inc/macro#1');
  });

  it('builds per-kind sections when given a tag subset', () => {
    const input = [
      notification({ id: 'review' }),
      notification({
        id: 'mention',
        tag: 'github_pr_mention',
        content: { githubKey: 'macro-inc/macro/pull/2', number: 2 },
      }),
    ];
    const reviews = computeReviewAttention(
      input,
      [],
      ['github_review_requested']
    );
    const mentions = computeReviewAttention(input, [], ['github_pr_mention']);

    expect(reviews.map((i) => i.notificationIds)).toEqual([['review']]);
    expect(mentions.map((i) => i.notificationIds)).toEqual([['mention']]);
  });

  it('joins to loaded PRs via the github key and dedupes reasons per actor', () => {
    const pr = makePullRequest({ id: 'row-1', name: 'Live title' });
    const items = computeReviewAttention(
      [
        notification({ id: 'n1', created_at: '2026-07-05T00:00:00Z' }),
        notification({ id: 'n2', created_at: '2026-07-06T00:00:00Z' }),
        notification({
          id: 'n3',
          tag: 'github_pr_mention',
          created_at: '2026-07-04T00:00:00Z',
          content: { senderGithubLogin: 'bob' },
        }),
      ],
      [pr]
    );

    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.pullRequest?.id).toBe('row-1');
    expect(item.title).toBe('Add feature');
    expect(item.notificationIds).toEqual(['n1', 'n2', 'n3']);
    // Two review requests from alice collapse into one reason with the
    // latest timestamp; bob's mention stays separate. Most recent first.
    expect(
      item.reasons.map((r) => [r.tag, r.actorLogin, r.notificationId])
    ).toEqual([
      ['github_review_requested', 'alice', 'n2'],
      ['github_pr_mention', 'bob', 'n3'],
    ]);
  });

  it('sorts items by most recent activity', () => {
    const items = computeReviewAttention(
      [
        notification({
          id: 'old',
          created_at: '2026-07-01T00:00:00Z',
          content: { githubKey: 'macro-inc/macro/pull/1', number: 1 },
        }),
        notification({
          id: 'new',
          created_at: '2026-07-06T00:00:00Z',
          content: { githubKey: 'macro-inc/macro/pull/2', number: 2 },
        }),
      ],
      []
    );
    expect(items.map((i) => i.reference)).toEqual([
      'macro-inc/macro#2',
      'macro-inc/macro#1',
    ]);
  });
});

describe('averageOpenAgeDays', () => {
  it('averages age of open PRs only', () => {
    const now = new Date('2026-07-07T00:00:00Z');
    expect(
      averageOpenAgeDays(
        [
          makePullRequest({ id: 'a', createdAt: '2026-07-05T00:00:00Z' }),
          makePullRequest({ id: 'b', createdAt: '2026-07-01T00:00:00Z' }),
          makePullRequest({
            id: 'merged',
            createdAt: '2026-01-01T00:00:00Z',
            metadata: { status: 'merged' },
          }),
        ],
        now
      )
    ).toBe(4);
    expect(averageOpenAgeDays([], now)).toBeUndefined();
  });
});

describe('buildTeamActivityDigest', () => {
  it('collects merges, opens, and task movement inside the window', () => {
    const now = new Date('2026-07-07T00:00:00Z');
    const { digest, eventCount } = buildTeamActivityDigest(
      [
        makePullRequest({
          id: 'merged',
          updatedAt: '2026-07-06T12:00:00Z',
          metadata: { status: 'merged', authorLogin: 'alice', name: 'Ship it' },
        }),
        makePullRequest({
          id: 'opened',
          createdAt: '2026-07-06T20:00:00Z',
          metadata: { authorLogin: 'bob', name: 'New thing' },
        }),
        makePullRequest({ id: 'old', createdAt: '2026-06-01T00:00:00Z' }),
      ],
      [
        makeTask({
          id: 'done',
          updatedAt: '2026-07-06T18:00:00Z',
          subType: { type: 'task', is_completed: true },
        }),
        makeTask({
          id: 'reviewing',
          updatedAt: '2026-07-06T18:00:00Z',
          statusOptionId: PROPERTY_OPTION_IDS.STATUS.IN_REVIEW,
        }),
        makeTask({ id: 'quiet', updatedAt: '2026-06-01T00:00:00Z' }),
      ],
      24,
      now
    );

    expect(eventCount).toBe(4);
    expect(digest).toContain('MERGED by alice: Ship it');
    expect(digest).toContain('OPENED by bob: New thing');
    expect(digest).toContain('TASK COMPLETED');
    expect(digest).toContain('TASK IN REVIEW');
  });
});

describe('buildEngineerDigests', () => {
  it('builds per-engineer digests and skips empty/unassigned ones', () => {
    const now = new Date('2026-07-07T00:00:00Z');
    const bentos: Parameters<typeof buildEngineerDigests>[0] = [
      {
        key: 'alice',
        githubLogin: 'alice',
        displayName: 'Alice',
        openPullRequests: [
          makePullRequest({
            id: 'wip',
            createdAt: '2026-07-04T00:00:00Z',
            metadata: { authorLogin: 'alice', name: 'WIP thing' },
          }),
        ],
        openTasks: [makeTask({ id: 't1', name: 'Fix the flux' })],
        mergedLast30Days: 1,
      },
      {
        key: 'unassigned',
        displayName: 'Unassigned',
        openPullRequests: [],
        openTasks: [makeTask({ id: 't2' })],
        mergedLast30Days: 0,
      },
    ];

    const digests = buildEngineerDigests(
      bentos,
      [
        makePullRequest({
          id: 'shipped',
          updatedAt: '2026-07-05T00:00:00Z',
          metadata: { status: 'merged', authorLogin: 'alice', name: 'Shipped' },
        }),
      ],
      7,
      now
    );

    expect(digests).toHaveLength(1);
    expect(digests[0].key).toBe('alice');
    expect(digests[0].digest).toContain('MERGED (last 7d): Shipped');
    expect(digests[0].digest).toContain('OPEN PRS: WIP thing (open 3d)');
    expect(digests[0].digest).toContain('OPEN TASKS: Fix the flux');
  });
});
