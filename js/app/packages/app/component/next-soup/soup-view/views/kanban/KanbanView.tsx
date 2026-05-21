import type { SoupEntity } from '@app/component/next-soup/create-soup-state';
import { useSoup } from '@app/component/next-soup/soup-context';
import {
  type SoupGroup,
  useSoupView,
} from '@app/component/next-soup/soup-view/soup-view-context';
import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { PropertyValueIcon } from '@core/component/Properties/component/propertyValue/PropertyValueIcon';
import { SYSTEM_PROPERTY_IDS } from '@core/component/Properties/constants';
import { UserIcon } from '@core/component/UserIcon';
import { useDisplayName } from '@core/user/displayName';
import { type MacroId, tryMacroId } from '@core/user/macroId';
import { ListEntity, ListLayoutProvider } from '@entity';
import CaretDownIcon from '@phosphor/caret-down.svg';
import Spinner from '@phosphor/spinner.svg';
import { cn } from '@ui';
import { createMemo, createSignal, For, Show } from 'solid-js';

export function KanbanView() {
  const { groups } = useSoupView();

  return (
    <div
      class={cn(
        'flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-hidden',
        'flex gap-4 px-4 py-3 items-stretch'
      )}
    >
      <For each={groups()}>{(group) => <KanbanColumn group={group} />}</For>
    </div>
  );
}

function KanbanColumn(props: { group: SoupGroup }) {
  const soup = useSoup();
  const panel = useSplitPanelOrThrow();
  const [containerRef, setContainerRef] = createSignal<HTMLElement>();

  const onCardClick = async (entity: SoupEntity, event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey) return;
    if (soup.previewEntity()) {
      soup.focus.set(entity.id);
      return;
    }
    await openEntityInSplitFromUnifiedList(entity, {
      openInNewSplit: event.shiftKey,
      splitHandle: panel.handle,
    });
  };

  return (
    <div class="w-72 shrink-0 flex flex-col min-h-0 rounded-lg bg-ink-muted/[0.035]">
      <KanbanColumnHeader group={props.group} />
      <div
        ref={setContainerRef}
        class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-px py-1 scrollbar-hidden"
      >
        <ListLayoutProvider ref={containerRef}>
          <For each={props.group.entities}>
            {(entity) => (
              <ListEntity
                entity={entity}
                checked={soup.selection.isSelected(entity.id)}
                highlighted={soup.focus.id() === entity.id}
                onChecked={() => soup.selection.toggle(entity)}
                onClick={(event: MouseEvent) => onCardClick(entity, event)}
                onMouseMove={() => {
                  if (soup.previewEntity()) return;
                  soup.focus.set(entity.id);
                }}
              />
            )}
          </For>
          <Show when={props.group.meta.hasMore()}>
            <button
              type="button"
              onClick={() => props.group.meta.loadMore()}
              disabled={props.group.meta.isLoading()}
              class={cn(
                'mx-1 my-1 px-2 py-1.5 rounded-md',
                'flex items-center justify-center gap-1.5',
                'text-xs text-ink-muted/70 font-medium',
                'hover:bg-ink-muted/6 hover:text-ink-muted',
                'disabled:opacity-60 disabled:cursor-default'
              )}
            >
              <Show
                when={!props.group.meta.isLoading()}
                fallback={
                  <>
                    <Spinner class="size-3 animate-spin" />
                    Loading
                  </>
                }
              >
                <CaretDownIcon class="size-2.5" />
                Load more
              </Show>
            </button>
          </Show>
        </ListLayoutProvider>
      </div>
    </div>
  );
}

function KanbanColumnHeader(props: { group: SoupGroup }) {
  return (
    <div
      class={cn(
        'shrink-0 sticky top-0 z-10',
        'flex items-center gap-2 px-3 py-2.5',
        'text-xs font-medium tracking-tight text-ink'
      )}
    >
      <KanbanGroupHeaderContent group={props.group} />
      <span class="ml-auto shrink-0 tabular-nums text-xxs font-medium text-ink-muted/70">
        {props.group.meta.count}
      </span>
    </div>
  );
}

function KanbanGroupHeaderContent(props: { group: SoupGroup }) {
  const { groupByField } = useSoupView();

  const assigneeId = createMemo(() => {
    const field = groupByField();
    if (
      field?.type !== 'property' ||
      field.propertyDefinitionId !== SYSTEM_PROPERTY_IDS.ASSIGNEES ||
      props.group.meta.key === ''
    ) {
      return;
    }
    return tryMacroId(props.group.meta.key);
  });

  return (
    <Show
      when={assigneeId()}
      fallback={
        <>
          <PropertyValueIcon
            optionId={props.group.meta.value as string}
            class="size-3.5"
          />
          <span class="truncate">{props.group.meta.label}</span>
        </>
      }
    >
      {(id) => (
        <AssigneeHeaderContent
          assigneeId={id()}
          fallbackLabel={props.group.meta.label}
        />
      )}
    </Show>
  );
}

function AssigneeHeaderContent(props: {
  assigneeId: MacroId;
  fallbackLabel: string;
}) {
  const [assigneeName] = useDisplayName(props.assigneeId);
  return (
    <>
      <UserIcon
        id={props.assigneeId}
        size="sm"
        suppressClick
        showTooltip={false}
      />
      <span class="truncate">
        {assigneeName() || props.assigneeId || props.fallbackLabel}
      </span>
    </>
  );
}
