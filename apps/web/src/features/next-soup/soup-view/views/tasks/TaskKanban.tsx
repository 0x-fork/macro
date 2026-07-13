import { useSoupView } from '@app/features/next-soup/soup-view/soup-view-context';
import { usePreviewPaneVisiblity } from '@app/features/next-soup/soup-view/use-preview-pane-visibility';
import { openEntityInSplitFromUnifiedList } from '@app/features/next-soup/utils';
import { useGlobalBlockOrchestrator } from '@components/app/GlobalAppState';
import { PreviewPanel } from '@components/app/PreviewPanel';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { Resize } from '@core/component/Resize';
import { UserIcon } from '@core/component/UserIcon';
import EmptyStatePreviewIcon from '@design/empty-state-doc.svg';
import {
  Entity,
  type EntityData,
  getPropertyOptionLabel,
  getTaskAssigneeIds,
  getTaskDueDate,
  getTaskPriorityOptionId,
  getTaskStatusOptionId,
  isTaskEntity,
  TASK_STATUS_OPTIONS,
  type TaskEntityWithProperties,
} from '@entity';
import { soupPropertyToProperty } from '@entity/extractors-property';
import CircleDashed from '@phosphor/circle-dashed.svg';
import { PropertyValueIcon } from '@property/component/propertyValue';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import type { Property } from '@property/types';
import { useBulkSaveEntityPropertiesMutation } from '@queries/properties/entity';
import { EntityType } from '@service-properties/generated/schemas/entityType';
import { cn, EmptyStatePanel, Layer } from '@ui';
import { format, isSameYear } from 'date-fns';
import { createMemo, createSignal, For, Show } from 'solid-js';

/** Column key for tasks without a Status value. */
const NO_STATUS_KEY = '';

const STATUS_COLUMNS = [
  ...TASK_STATUS_OPTIONS.map((option) => ({
    key: option.value as string,
    label: option.label,
  })),
  { key: NO_STATUS_KEY, label: 'No status' },
];

const EPOCH = new Date(0).toISOString();

/**
 * Status `Property` stub for saves — a task may not have the property
 * attached yet, so builds it from the system definition (same pattern as
 * `buildStubProperty` in the task list's grid layout).
 */
function buildStatusProperty(): Property {
  return soupPropertyToProperty({
    id: SYSTEM_PROPERTY_IDS.STATUS,
    definition: {
      id: SYSTEM_PROPERTY_IDS.STATUS,
      display_name: 'Status',
      data_type: 'SELECT_STRING',
      is_metadata: false,
      is_multi_select: false,
      is_system: true,
      owner: { scope: 'system' },
      specific_entity_type: undefined,
      created_at: EPOCH,
      updated_at: EPOCH,
    },
  });
}

/** Due dates are calendar dates, not activity timestamps — always show the day. */
const formatDueDate = (iso: string) => {
  const date = new Date(iso);
  return isSameYear(date, new Date())
    ? format(date, 'MMM d')
    : format(date, 'M/d/yy');
};

/**
 * Kanban board for the Tasks view: one column per task Status option plus
 * "No status", fed by the same filtered soup entities as the list (mirrors
 * the Customers view's `CompanyKanban`). Cards drag between columns to
 * update the task's Status property.
 *
 * Like the list, the board supports the toggleable preview pane (Preview
 * button / space in the filters bar): while it's open, clicking a card
 * previews the task to the side instead of replacing the split.
 */
export function TaskKanban() {
  const { source, soup } = useSoupView();
  const panel = useSplitPanelOrThrow();
  const saveMutation = useBulkSaveEntityPropertiesMutation();
  const orchestrator = useGlobalBlockOrchestrator();

  const { paneVisible, selectedEntity } = usePreviewPaneVisiblity();

  const tasks = createMemo(() => source.data().filter(isTaskEntity));

  const resolveStatus = (entity: EntityData) =>
    getTaskStatusOptionId(entity as TaskEntityWithProperties) ?? NO_STATUS_KEY;

  const columns = createMemo(() => {
    const buckets = new Map<string, EntityData[]>(
      STATUS_COLUMNS.map((column) => [column.key, []])
    );
    for (const task of tasks()) {
      const key = resolveStatus(task);
      (buckets.get(buckets.has(key) ? key : NO_STATUS_KEY) ?? []).push(task);
    }
    return STATUS_COLUMNS.map((column) => ({
      ...column,
      entities: buckets.get(column.key) ?? [],
    }));
  });

  const [draggedId, setDraggedId] = createSignal<string>();
  const [dropTarget, setDropTarget] = createSignal<string>();

  const moveToStatus = (entityId: string, statusKey: string) => {
    const entity = tasks().find((task) => task.id === entityId);
    if (!entity) return;
    if (resolveStatus(entity) === statusKey) return;

    saveMutation.mutate({
      properties: [
        {
          entityId,
          entityType: EntityType.TASK,
          property: buildStatusProperty(),
          apiValues: {
            valueType: 'SELECT_STRING',
            values: statusKey === NO_STATUS_KEY ? null : [statusKey],
          },
        },
      ],
    });
  };

  const openTask = (entity: EntityData, event: MouseEvent) => {
    soup.focus.set(entity.id);

    // While the preview pane is open, card clicks retarget it instead of
    // replacing the split (mirrors the list view's behavior).
    if (paneVisible()) {
      soup.setPreviewEntity(entity.id);
      return;
    }

    void openEntityInSplitFromUnifiedList(entity, {
      openInNewSplit: event.shiftKey,
      splitHandle: panel.handle,
      referredFrom: 'tasks',
    });
  };

  return (
    <Resize.Zone direction="horizontal" gutter={0}>
      <Resize.Panel id="task-kanban" minSize={200}>
        <div
          class={cn(
            'size-full min-w-0 overflow-x-auto overflow-y-hidden',
            paneVisible() && 'border-r border-edge-muted'
          )}
        >
          <div class="flex h-full gap-3 p-3">
            <For each={columns()}>
              {(column) => (
                <div
                  class={cn(
                    'flex h-full w-64 shrink-0 flex-col rounded-lg border border-edge-muted bg-surface',
                    dropTarget() === column.key &&
                      draggedId() &&
                      'border-accent/50 bg-accent/5'
                  )}
                  onDragOver={(e) => {
                    if (!draggedId()) return;
                    e.preventDefault();
                    setDropTarget(column.key);
                  }}
                  onDragLeave={(e) => {
                    if (
                      e.relatedTarget instanceof Node &&
                      e.currentTarget.contains(e.relatedTarget)
                    ) {
                      return;
                    }
                    if (dropTarget() === column.key) setDropTarget(undefined);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id =
                      draggedId() ?? e.dataTransfer?.getData('text/plain');
                    setDropTarget(undefined);
                    setDraggedId(undefined);
                    if (id) moveToStatus(id, column.key);
                  }}
                >
                  <div class="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-ink-muted">
                    <Show
                      when={column.key !== NO_STATUS_KEY}
                      fallback={
                        <CircleDashed class="size-3.5 text-ink-extra-muted" />
                      }
                    >
                      <PropertyValueIcon
                        optionId={column.key}
                        class="size-3.5"
                      />
                    </Show>
                    <span class="truncate">{column.label}</span>
                    <span class="ml-auto shrink-0 tabular-nums px-1.5 py-px rounded-full bg-ink/10 text-ink-extra-muted font-medium">
                      {column.entities.length}
                    </span>
                  </div>
                  <div class="min-h-0 flex-1 overflow-y-auto scrollbar-hidden flex flex-col gap-2 px-2 pb-2">
                    <For each={column.entities}>
                      {(entity) => (
                        <TaskKanbanCard
                          entity={entity}
                          dragging={draggedId() === entity.id}
                          onDragStart={(e) => {
                            e.dataTransfer?.setData('text/plain', entity.id);
                            if (e.dataTransfer) {
                              e.dataTransfer.effectAllowed = 'move';
                            }
                            setDraggedId(entity.id);
                          }}
                          onDragEnd={() => {
                            setDraggedId(undefined);
                            setDropTarget(undefined);
                          }}
                          onClick={(e) => openTask(entity, e)}
                        />
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Resize.Panel>
      <Show when={paneVisible()}>
        <Resize.Panel
          id="soup-preview"
          minSize={500}
          target={{ kind: 'percent', percent: 70 }}
        >
          <Show
            when={selectedEntity()}
            fallback={
              <EmptyStatePanel
                graphic={EmptyStatePreviewIcon}
                title="Nothing selected"
                description="Select a card from the board to preview it here"
                centered
              />
            }
          >
            {(entity) => (
              <PreviewPanel
                selectedEntity={entity()}
                orchestrator={orchestrator}
                splitPanelContext={panel}
              />
            )}
          </Show>
        </Resize.Panel>
      </Show>
    </Resize.Zone>
  );
}

function TaskKanbanCard(props: {
  entity: EntityData;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onClick: (e: MouseEvent) => void;
}) {
  const task = () => props.entity as TaskEntityWithProperties;
  const assigneeIds = () => getTaskAssigneeIds(task());
  const priorityId = () => getTaskPriorityOptionId(task());
  const dueDate = () => getTaskDueDate(task());

  return (
    <Layer depth={2}>
      <div
        draggable={true}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        onClick={props.onClick}
        class={cn(
          'flex flex-col gap-1.5 rounded-lg border border-edge-muted bg-panel p-2.5 text-sm',
          'hover:border-edge transition-colors',
          props.dragging && 'opacity-40'
        )}
      >
        <div class="flex items-center gap-2 min-w-0">
          <div class="size-4 shrink-0">
            <Entity.Icon entity={props.entity} />
          </div>
          <span class="ph-no-capture truncate font-semibold min-w-0">
            <Entity.Title entity={props.entity} />
          </span>
          <Show when={assigneeIds().length > 0}>
            <span class="ml-auto flex shrink-0 -space-x-1">
              <For each={assigneeIds().slice(0, 3)}>
                {(id) => <UserIcon id={id} size="sm" suppressClick />}
              </For>
            </span>
          </Show>
        </div>
        <Show when={priorityId() || dueDate()}>
          <div class="flex items-center gap-2 min-w-0 text-xs text-ink-extra-muted">
            <Show when={priorityId()}>
              {(id) => (
                <span class="flex items-center gap-1 min-w-0">
                  <PropertyValueIcon optionId={id()} class="size-3" />
                  <span class="truncate">{getPropertyOptionLabel(id())}</span>
                </span>
              )}
            </Show>
            <Show when={dueDate()}>
              {(date) => (
                <span class="ml-auto shrink-0">{formatDueDate(date())}</span>
              )}
            </Show>
          </div>
        </Show>
      </div>
    </Layer>
  );
}
