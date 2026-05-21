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
import { Button, cn } from '@ui';
import { createMemo, createSignal, For, Show } from 'solid-js';

export function KanbanView() {
  const { groups } = useSoupView();

  return (
    <div
      class={cn(
        'flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-hidden',
        'flex gap-3 px-3 py-2 items-stretch'
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
    <div class="w-72 shrink-0 flex flex-col min-h-0 rounded-lg bg-surface border border-edge-muted">
      <KanbanColumnHeader group={props.group} />
      <div
        ref={setContainerRef}
        class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col py-1"
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
            <div class="flex items-center justify-center py-2">
              <Button
                variant="base"
                size="sm"
                depth={2}
                onClick={() => props.group.meta.loadMore()}
                disabled={props.group.meta.isLoading()}
              >
                <Show
                  when={!props.group.meta.isLoading()}
                  fallback={
                    <>
                      <Spinner class="size-3 animate-spin" />
                      Loading...
                    </>
                  }
                >
                  <CaretDownIcon class="size-2.5" />
                  Load more
                </Show>
              </Button>
            </div>
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
        'shrink-0 flex items-center gap-2 px-2 py-2 border-b border-edge-muted',
        'text-xs font-semibold tracking-tight text-text-muted'
      )}
    >
      <KanbanGroupHeaderContent group={props.group} />
      <span
        class={cn(
          'ml-auto shrink-0 tabular-nums text-xs font-medium',
          'px-1.5 py-px rounded-full bg-ink/10 text-text-subtle'
        )}
      >
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
