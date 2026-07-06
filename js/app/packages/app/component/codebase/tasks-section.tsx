import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { ListEntity, ListLayoutProvider, type TaskEntity } from '@entity';
import CheckSquareIcon from '@phosphor/check-square.svg';
import FolderIcon from '@phosphor/folder.svg';
import { Button, EmptyStatePanel } from '@ui';
import { createMemo, For, Match, Show, Switch } from 'solid-js';
import { useCodebaseTasks, useProjectNames } from './data';
import { groupTasksByProject, type TaskProjectGroup } from './model';

function ProjectGroupHeader(props: { group: TaskProjectGroup }) {
  return (
    <div class="flex items-center gap-2 px-3 pt-4 pb-1.5">
      <FolderIcon class="size-4 shrink-0 text-ink-extra-muted" />
      <span class="text-sm font-semibold text-ink">{props.group.name}</span>
      <span class="text-xs text-ink-extra-muted tabular-nums">
        {props.group.openCount} open · {props.group.tasks.length} total
      </span>
    </div>
  );
}

export function TasksSection() {
  const panel = useSplitPanelOrThrow();
  const { query, tasks } = useCodebaseTasks();
  const projectNames = useProjectNames();

  const groups = createMemo(() => groupTasksByProject(tasks(), projectNames()));

  const openTask = (task: TaskEntity, event: MouseEvent) => {
    void openEntityInSplitFromUnifiedList(task, {
      splitHandle: panel.handle,
      openInNewSplit: event.metaKey || event.ctrlKey,
      referredFrom: 'codebase',
    });
  };

  let listRef: HTMLDivElement | undefined;

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} class="min-h-0 flex-1 overflow-y-auto pb-4">
        <ListLayoutProvider ref={() => listRef}>
          <Switch>
            <Match when={query.isLoading}>
              <div class="px-3 py-6 text-sm text-ink-muted">Loading tasks…</div>
            </Match>
            <Match when={groups().length === 0}>
              <EmptyStatePanel
                centered
                graphic={CheckSquareIcon}
                graphicClass="h-24 w-24 text-ink-extra-muted"
                title="No tasks"
                description="Tasks show up here grouped by the project they belong to."
              />
            </Match>
            <Match when={true}>
              <For each={groups()}>
                {(group) => (
                  <section>
                    <ProjectGroupHeader group={group} />
                    <For each={group.tasks}>
                      {(task) => (
                        <ListEntity
                          entity={task}
                          hideCheckbox
                          onClick={(event) => openTask(task, event)}
                        />
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
