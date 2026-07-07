import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { TabsInset } from '@core/component/TabsInset';
import {
  type GithubPullRequestEntity,
  ListEntity,
  ListLayoutProvider,
  type TaskEntity,
} from '@entity';
import CaretDownIcon from '@phosphor/caret-down.svg';
import GitPullRequestIcon from '@phosphor/git-pull-request.svg';
import UsersIcon from '@phosphor/users.svg';
import { Button, Dropdown, EmptyStatePanel } from '@ui';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { AuthorAvatar } from './author-avatar';
import { useCodebasePullRequests, useCodebaseTasks } from './data';
import {
  groupPullRequestsByAuthor,
  matchesPrStatusFilter,
  PR_STATUS_FILTERS,
  type PrStatusFilter,
  type PullRequestAuthorGroup,
  pullRequestAuthorKey,
  UNKNOWN_AUTHOR_KEY,
} from './model';
import { createTaskLinkIndex, PullRequestRowWithTasks } from './task-links';

const STATUS_LABELS: Record<PrStatusFilter, string> = {
  all: 'All',
  open: 'Open',
  draft: 'Draft',
  merged: 'Merged',
  closed: 'Closed',
};

const STATUS_TAB_ITEMS = PR_STATUS_FILTERS.map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

function AuthorGroupHeader(props: { group: PullRequestAuthorGroup }) {
  return (
    <div class="flex items-center gap-2 px-3 pt-4 pb-1.5">
      <AuthorAvatar login={props.group.authorLogin} class="size-5 shrink-0" />
      <span class="text-sm font-semibold text-ink">
        {props.group.authorLogin ?? 'Unknown author'}
      </span>
      <span class="text-xs text-ink-extra-muted tabular-nums">
        {props.group.openCount} open · {props.group.pullRequests.length} total
      </span>
    </div>
  );
}

/** Linked-task pills shown per PR row. */
const TASK_PILL_LIMIT = 2;

export function PullRequestsSection() {
  const panel = useSplitPanelOrThrow();
  const { query, pullRequests } = useCodebasePullRequests();
  const { tasks } = useCodebaseTasks();

  const openTasks = createMemo(() =>
    tasks().filter((task) => !task.subType.is_completed)
  );
  const taskLinks = createTaskLinkIndex(openTasks);

  const openTaskInNewSplit = (task: TaskEntity, _event: MouseEvent) => {
    void openEntityInSplitFromUnifiedList(task, {
      splitHandle: panel.handle,
      openInNewSplit: true,
      referredFrom: 'codebase',
    });
  };

  const [statusFilter, setStatusFilter] = createSignal<PrStatusFilter>('open');
  const [authorFilter, setAuthorFilter] = createSignal<string[]>([]);

  const authors = createMemo(() => {
    const logins = new Set<string>();
    for (const pullRequest of pullRequests()) {
      logins.add(pullRequestAuthorKey(pullRequest));
    }
    return [...logins].sort((a, b) => a.localeCompare(b));
  });

  const toggleAuthor = (login: string, checked: boolean) => {
    setAuthorFilter((current) =>
      checked ? [...current, login] : current.filter((l) => l !== login)
    );
  };

  const filtered = createMemo(() => {
    const selectedAuthors = authorFilter();
    return pullRequests().filter((pullRequest) => {
      if (!matchesPrStatusFilter(pullRequest, statusFilter())) return false;
      if (
        selectedAuthors.length > 0 &&
        !selectedAuthors.includes(pullRequestAuthorKey(pullRequest))
      ) {
        return false;
      }
      return true;
    });
  });

  const groups = createMemo(() => groupPullRequestsByAuthor(filtered()));

  const openPullRequest = (
    pullRequest: GithubPullRequestEntity,
    event: MouseEvent
  ) => {
    void openEntityInSplitFromUnifiedList(pullRequest, {
      splitHandle: panel.handle,
      openInNewSplit: event.metaKey || event.ctrlKey,
      referredFrom: 'codebase',
    });
  };

  let listRef: HTMLDivElement | undefined;

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex flex-wrap items-center gap-2 px-3 py-2">
        <TabsInset
          list={STATUS_TAB_ITEMS}
          value={statusFilter()}
          onChange={(value) => setStatusFilter(value as PrStatusFilter)}
        />
        <Dropdown placement="bottom-start" gutter={4}>
          <Dropdown.Trigger
            variant="ghost"
            size="sm"
            class="gap-1.5 text-ink-muted ring ring-edge-muted ring-inset rounded-lg"
          >
            <UsersIcon class="size-3.5" />
            {authorFilter().length > 0
              ? `${authorFilter().length} selected`
              : 'Everyone'}
            <CaretDownIcon class="size-3 text-ink-extra-muted" />
          </Dropdown.Trigger>
          <Dropdown.Content class="min-w-56 max-h-80 overflow-y-auto shadow-menu">
            <Dropdown.Group class="p-1">
              <For each={authors()}>
                {(login) => (
                  <Dropdown.CheckboxItem
                    class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink outline-none data-highlighted:bg-ink/5"
                    checked={authorFilter().includes(login)}
                    onChange={(checked: boolean) =>
                      toggleAuthor(login, checked)
                    }
                    closeOnSelect={false}
                  >
                    <AuthorAvatar
                      login={login === UNKNOWN_AUTHOR_KEY ? undefined : login}
                      class="size-4 shrink-0"
                    />
                    <span class="flex-1 truncate">
                      {login === UNKNOWN_AUTHOR_KEY ? 'Unknown author' : login}
                    </span>
                    <Show when={authorFilter().includes(login)}>
                      <span class="text-xs text-accent">✓</span>
                    </Show>
                  </Dropdown.CheckboxItem>
                )}
              </For>
              <Show when={authorFilter().length > 0}>
                <Dropdown.Item
                  class="mt-1 rounded-md px-2 py-1.5 text-sm text-ink-muted outline-none data-highlighted:bg-ink/5"
                  onSelect={() => setAuthorFilter([])}
                >
                  Clear author filter
                </Dropdown.Item>
              </Show>
            </Dropdown.Group>
          </Dropdown.Content>
        </Dropdown>
        <span class="ml-auto text-xs text-ink-extra-muted tabular-nums">
          {filtered().length} pull requests
        </span>
      </div>

      <div ref={listRef} class="min-h-0 flex-1 overflow-y-auto pb-4">
        <ListLayoutProvider ref={() => listRef}>
          <Switch>
            <Match when={query.isLoading}>
              <div class="px-3 py-6 text-sm text-ink-muted">
                Loading pull requests…
              </div>
            </Match>
            <Match when={groups().length === 0}>
              <EmptyStatePanel
                centered
                graphic={GitPullRequestIcon}
                graphicClass="h-24 w-24 text-ink-extra-muted"
                title="No pull requests"
                description="Pull requests from your connected GitHub account will show up here as they see activity."
              />
            </Match>
            <Match when={true}>
              <taskLinks.Collectors />
              <For each={groups()}>
                {(group) => (
                  <section>
                    <AuthorGroupHeader group={group} />
                    <For each={group.pullRequests}>
                      {(pullRequest) => (
                        <PullRequestRowWithTasks
                          linked={taskLinks.tasksFor(pullRequest)}
                          pillLimit={TASK_PILL_LIMIT}
                          onOpenTask={openTaskInNewSplit}
                        >
                          <ListEntity
                            entity={pullRequest}
                            hideCheckbox
                            onClick={(event) =>
                              openPullRequest(pullRequest, event)
                            }
                          />
                        </PullRequestRowWithTasks>
                      )}
                    </For>
                  </section>
                )}
              </For>
              <Show when={query.hasNextPage}>
                <div class="flex justify-center pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-ink-muted ring ring-edge-muted ring-inset rounded-lg"
                    disabled={query.isFetchingNextPage}
                    onClick={() => void query.fetchNextPage()}
                  >
                    {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              </Show>
            </Match>
          </Switch>
        </ListLayoutProvider>
      </div>
    </div>
  );
}
