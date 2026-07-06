import type { GithubPullRequestEntity, TaskEntity } from '@entity/types/entity';
import { PROPERTY_OPTION_IDS, SYSTEM_PROPERTY_IDS } from '@property/constants';
import { describe, expect, it } from 'vitest';
import {
  computeWeeklyPrActivity,
  countTasksByStatus,
  groupPullRequestsByAuthor,
  groupTasksByProject,
  hasFailingChecks,
  matchesPrStatusFilter,
  pullRequestDisplayStatus,
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
