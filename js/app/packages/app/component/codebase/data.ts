import {
  compileToAst,
  defineQueryFilters,
  queryStateFrom,
} from '@app/component/next-soup/filters/filter-store';
import {
  type GithubPullRequestEntity,
  isGithubPrEntity,
  isTaskEntity,
  type TaskEntity,
} from '@entity';
import type { SoupAstItemsQueryArgs } from '@queries/soup/items';
import { useSoupAstItemsQuery } from '@queries/soup/items';
import { useProjectsQuery } from '@queries/storage/projects';
import { createMemo } from 'solid-js';

const CODEBASE_SOUP_STALE_TIME = 60 * 1000;

/**
 * The codebase view isn't a soup `ListView` — it composes its own queries so
 * pull requests can be grouped by author client-side (the grouped soup API has
 * no person grouping for foreign entities). `defineQueryFilters` NIL-excludes
 * every entity type the query doesn't reference, so each query below returns
 * exactly one entity type.
 */
const PULL_REQUEST_SOUP_ARGS: SoupAstItemsQueryArgs = {
  params: { limit: 100, sort_method: 'updated_at' },
  body: compileToAst(
    queryStateFrom(
      defineQueryFilters({
        include: { foreignEntitySource: ['github_pull_request'] },
      })
    )
  ),
};

// Tasks feed the digest, charts, and PR link pills rather than a paginated
// list, so fetch a wider window than the PR query; anything beyond the 250
// most recently updated tasks is out of scope for the dashboard.
const TASK_SOUP_ARGS: SoupAstItemsQueryArgs = {
  params: { limit: 250, sort_method: 'updated_at' },
  body: compileToAst(
    queryStateFrom(
      defineQueryFilters({
        include: { subType: ['task'] },
      })
    )
  ),
};

export function useCodebasePullRequests() {
  const query = useSoupAstItemsQuery(
    () => PULL_REQUEST_SOUP_ARGS,
    () => ({
      staleTime: CODEBASE_SOUP_STALE_TIME,
      showSupportedForeignEntities: true,
      meta: { itemFilter: (item) => item.tag === 'foreignEntity' },
    })
  );

  const pullRequests = createMemo<GithubPullRequestEntity[]>(() =>
    (query.data?.entities ?? []).filter(isGithubPrEntity)
  );

  return { query, pullRequests };
}

export function useCodebaseTasks() {
  const query = useSoupAstItemsQuery(
    () => TASK_SOUP_ARGS,
    () => ({
      staleTime: CODEBASE_SOUP_STALE_TIME,
      meta: {
        itemFilter: (item) =>
          item.tag === 'document' && item.data.subType?.type === 'task',
      },
    })
  );

  const tasks = createMemo<TaskEntity[]>(() =>
    (query.data?.entities ?? []).filter(isTaskEntity)
  );

  return { query, tasks };
}

/** Project id → display name, for grouping tasks by project. */
export function useProjectNames() {
  const projects = useProjectsQuery();

  return createMemo<Map<string, string>>(() => {
    const names = new Map<string, string>();
    for (const project of projects.data ?? []) {
      names.set(project.id, project.name);
    }
    return names;
  });
}
