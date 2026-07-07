import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { type EntityData, ListEntity, ListLayoutProvider } from '@entity';
import FolderIcon from '@phosphor/folder.svg';
import { Button } from '@ui';
import { createMemo, For, type JSX, Show } from 'solid-js';
import { AuthorAvatar } from './author-avatar';
import {
  useCodebasePullRequests,
  useCodebaseTasks,
  useProjectNames,
} from './data';
import {
  groupPullRequestsByAuthor,
  groupTasksByProject,
  matchesPrStatusFilter,
} from './model';
import { ActivityCard, Card, PrStatTiles, TaskStatusCard } from './widgets';

/** Rows shown per list panel before deferring to the dedicated tab. */
const PANEL_ROW_LIMIT = 6;

type PanelGroup<T> = {
  key: string;
  header: () => JSX.Element;
  items: T[];
};

function ViewAllButton(props: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      class="shrink-0 text-ink-muted ring ring-edge-muted ring-inset rounded-lg"
      onClick={() => props.onClick()}
    >
      {props.label}
    </Button>
  );
}

/**
 * Grouped entity list capped at {@link PANEL_ROW_LIMIT} rows; group headers
 * don't count against the cap and partially-shown groups keep their header.
 */
function EntityListPanel<T extends EntityData>(props: {
  groups: PanelGroup<T>[];
  totalCount: number;
  emptyLabel: string;
  onOpen: (entity: T, event: MouseEvent) => void;
}) {
  let listRef: HTMLDivElement | undefined;

  const visibleGroups = createMemo(() => {
    const groups: PanelGroup<T>[] = [];
    let remaining = PANEL_ROW_LIMIT;
    for (const group of props.groups) {
      if (remaining <= 0) break;
      const items = group.items.slice(0, remaining);
      remaining -= items.length;
      groups.push({ ...group, items });
    }
    return groups;
  });

  const hiddenCount = () =>
    Math.max(0, props.totalCount - Math.min(PANEL_ROW_LIMIT, props.totalCount));

  return (
    <div ref={listRef} class="-mx-2 flex flex-col">
      <ListLayoutProvider ref={() => listRef}>
        <Show
          when={props.groups.length > 0}
          fallback={
            <div class="px-3 py-4 text-sm text-ink-muted">
              {props.emptyLabel}
            </div>
          }
        >
          <For each={visibleGroups()}>
            {(group) => (
              <section>
                {group.header()}
                <For each={group.items}>
                  {(entity) => (
                    <ListEntity
                      entity={entity}
                      hideCheckbox
                      onClick={(event) => props.onOpen(entity, event)}
                    />
                  )}
                </For>
              </section>
            )}
          </For>
          <Show when={hiddenCount() > 0}>
            <div class="px-3 pt-2 text-xs text-ink-extra-muted tabular-nums">
              +{hiddenCount()} more
            </div>
          </Show>
        </Show>
      </ListLayoutProvider>
    </div>
  );
}

const PANEL_GROUP_HEADER_CLASS = 'flex items-center gap-2 px-3 pt-2.5 pb-1';

export function OverviewSection(props: {
  onShowPullRequests: () => void;
  onShowTasks: () => void;
}) {
  const panel = useSplitPanelOrThrow();
  const { pullRequests } = useCodebasePullRequests();
  const { tasks } = useCodebaseTasks();
  const projectNames = useProjectNames();

  const openPullRequests = createMemo(() =>
    pullRequests().filter(
      (pullRequest) =>
        matchesPrStatusFilter(pullRequest, 'open') ||
        matchesPrStatusFilter(pullRequest, 'draft')
    )
  );

  const prGroups = createMemo(() =>
    groupPullRequestsByAuthor(openPullRequests()).map((group) => ({
      key: group.key,
      items: group.pullRequests,
      header: () => (
        <div class={PANEL_GROUP_HEADER_CLASS}>
          <AuthorAvatar login={group.authorLogin} class="size-4 shrink-0" />
          <span class="text-xs font-semibold text-ink">
            {group.authorLogin ?? 'Unknown author'}
          </span>
          <span class="text-xs text-ink-extra-muted tabular-nums">
            {group.pullRequests.length}
          </span>
        </div>
      ),
    }))
  );

  const openTasks = createMemo(() =>
    tasks().filter((task) => !task.subType.is_completed)
  );

  const taskGroups = createMemo(() =>
    groupTasksByProject(openTasks(), projectNames()).map((group) => ({
      key: group.key,
      items: group.tasks,
      header: () => (
        <div class={PANEL_GROUP_HEADER_CLASS}>
          <FolderIcon class="size-3.5 shrink-0 text-ink-extra-muted" />
          <span class="text-xs font-semibold text-ink">{group.name}</span>
          <span class="text-xs text-ink-extra-muted tabular-nums">
            {group.tasks.length}
          </span>
        </div>
      ),
    }))
  );

  const openEntity = (entity: EntityData, event: MouseEvent) => {
    void openEntityInSplitFromUnifiedList(entity, {
      splitHandle: panel.handle,
      openInNewSplit: event.metaKey || event.ctrlKey,
      referredFrom: 'codebase',
    });
  };

  return (
    <div class="min-h-0 flex-1 overflow-y-auto @container">
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-3 px-3 py-3">
        <PrStatTiles pullRequests={pullRequests()} />

        <div class="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
          <ActivityCard pullRequests={pullRequests()} />
          <TaskStatusCard tasks={tasks()} />
        </div>

        <div class="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
          <Card
            title="Open pull requests"
            subtitle={`${openPullRequests().length} open, grouped by author`}
            actions={
              <ViewAllButton
                label="View all"
                onClick={props.onShowPullRequests}
              />
            }
          >
            <EntityListPanel
              groups={prGroups()}
              totalCount={openPullRequests().length}
              emptyLabel="No open pull requests."
              onOpen={openEntity}
            />
          </Card>

          <Card
            title="Open tasks"
            subtitle={`${openTasks().length} open, grouped by project`}
            actions={
              <ViewAllButton label="View all" onClick={props.onShowTasks} />
            }
          >
            <EntityListPanel
              groups={taskGroups()}
              totalCount={openTasks().length}
              emptyLabel="No open tasks."
              onOpen={openEntity}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
