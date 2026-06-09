import type { SidebarState } from '@app/component/app-sidebar/sidebar';
import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { pinnedEntities, unpinEntity } from '@app/signal/pins';
import { globalSplitManager } from '@app/signal/splitLayout';
import { ContextMenuContent, MenuItem } from '@core/component/ContextMenu';
import { type EntityData, EntityRowIcon, EntityRowTitle } from '@entity';
import { ContextMenu } from '@kobalte/core/context-menu';
import { Button, cn, Tooltip } from '@ui';
import { For, Show } from 'solid-js';

function entityTitle(entity: EntityData): string {
  return entity.name || 'Untitled';
}

function PinnedEntityItem(props: { entity: EntityData; isSlim?: boolean }) {
  const isSlim = () => props.isSlim ?? false;

  const canOpenInNewSplit = () =>
    globalSplitManager()?.canAppendSplit() ?? false;

  const open = (newSplit = false) => {
    void openEntityInSplitFromUnifiedList(props.entity, {
      openInNewSplit: newSplit,
    });
  };

  const ButtonContent = () => (
    <Button
      class={cn(
        'flex items-center cursor-default rounded-md text-ink-extra-muted not-disabled:hover:bg-ink/3',
        isSlim()
          ? 'justify-center size-8'
          : 'justify-start gap-2 w-full h-8 py-1'
      )}
      draggable={false}
      variant="ghost"
      size="sm"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        open(e.shiftKey);
      }}
    >
      <div class="relative flex items-center justify-center shrink-0 size-5">
        <EntityRowIcon
          entity={props.entity}
          suppressClick
          showTooltip={false}
        />
      </div>

      <Show when={!isSlim()}>
        <span class="text-sm font-medium truncate">
          <EntityRowTitle entity={props.entity} />
        </span>
      </Show>
    </Button>
  );

  return (
    <ContextMenu>
      <ContextMenu.Trigger class="w-full">
        <Show
          when={!isSlim()}
          fallback={
            <Tooltip label={entityTitle(props.entity)} placement="right">
              <ButtonContent />
            </Tooltip>
          }
        >
          <ButtonContent />
        </Show>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenuContent class="text-xs text-ink-muted">
          <MenuItem text="Open in current split" onClick={() => open(false)} />
          <MenuItem
            text="Open in new split"
            onClick={() => open(true)}
            disabled={!canOpenInNewSplit()}
          />
          <MenuItem text="Unpin" onClick={() => unpinEntity(props.entity.id)} />
        </ContextMenuContent>
      </ContextMenu.Portal>
    </ContextMenu>
  );
}

export const PinnedWidget = (props: { sidebarState: SidebarState }) => {
  const isSlim = () => props.sidebarState === 'slim';
  const SLIM_MAX = 4;
  const slimVisible = () => pinnedEntities().slice(0, SLIM_MAX);
  const slimOverflow = () => Math.max(0, pinnedEntities().length - SLIM_MAX);

  return (
    <Show when={pinnedEntities().length > 0}>
      <Show
        when={!isSlim()}
        fallback={
          <section class="w-full p-2 flex flex-col items-center">
            <For each={slimVisible()}>
              {(entity) => <PinnedEntityItem entity={entity} isSlim />}
            </For>
            <Show when={slimOverflow() > 0}>
              <span class="text-xxs text-ink-muted mt-1">
                +{slimOverflow()}
              </span>
            </Show>
          </section>
        }
      >
        <section class="size-full flex flex-col justify-center px-2 py-1.5">
          <header class="text-xs font-medium text-ink-muted ml-2 mb-1">
            <h1>Pinned</h1>
          </header>

          <div class="flex-1">
            <For each={pinnedEntities()}>
              {(entity) => <PinnedEntityItem entity={entity} />}
            </For>
          </div>
        </section>
      </Show>
    </Show>
  );
};
