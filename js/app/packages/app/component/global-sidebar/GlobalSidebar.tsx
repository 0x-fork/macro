import { useGlobalSidebarItems } from '@app/component/next-soup/sidebar/useGlobalSidebarItems';
import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import {
  type SidebarViewShortcutId,
  setIsGlobalSidebarCollapsed,
} from '@core/signal/layout/globalSidebar';
import { setCreateMenuOpen } from '@app/component/Launcher';
import { getActiveSplitHandle } from './pinnedActions';
import CaretLeft from '@icon/regular/caret-left.svg';
import CaretDown from '@icon/regular/caret-down.svg';
import CaretRight from '@icon/regular/caret-right.svg';
import HomeIcon from '@icon/regular/house.svg';
import ListIcon from '@icon/regular/list.svg';
import CheckCircleIcon from '@icon/regular/check-circle.svg';
import UserCircleIcon from '@icon/regular/user-circle.svg';
import { ListEntity } from '@entity';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { openSidebarPinnedItem } from './pinnedActions';

const SAVED_VIEWS: Array<{
  id: SidebarViewShortcutId;
  label: string;
  icon: typeof HomeIcon;
}> = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'inbox', label: 'Inbox', icon: ListIcon },
  { id: 'sent', label: 'Sent', icon: CheckCircleIcon },
  { id: 'my-notes', label: 'My Notes', icon: ListIcon },
  { id: 'my-tasks', label: 'My Tasks', icon: CheckCircleIcon },
  { id: 'team-tasks', label: 'Team Tasks', icon: UserCircleIcon },
];

export function GlobalSidebar() {
  const { pinnedItems, channelItems, isLoading } = useGlobalSidebarItems();
  const [activeViewId, setActiveViewId] = createSignal<SidebarViewShortcutId>('inbox');
  const [pinnedItemsExpanded, setPinnedItemsExpanded] = createSignal(true);
  const [pinnedDocsExpanded, setPinnedDocsExpanded] = createSignal(true);
  const [channelsExpanded, setChannelsExpanded] = createSignal(true);
  const [showAllChannels, setShowAllChannels] = createSignal(false);

  const openView = (id: SidebarViewShortcutId, label: string) => {
    setActiveViewId(id);
    openSidebarPinnedItem({
      kind: 'view',
      id,
      label,
    });
  };

  const pinnedDocs = createMemo(() =>
    pinnedItems().flatMap((item) =>
      item.kind === 'entity' && item.entity.type === 'document' ? [item] : []
    )
  );

  const channels = createMemo(() => channelItems());

  const visibleChannels = createMemo(() =>
    showAllChannels() ? channels() : channels().slice(0, 20)
  );

  return (
    <div class="size-full bg-panel border-r border-edge-muted/60 flex flex-col min-h-0">
      <div class="h-10 px-2 flex items-center justify-between border-b border-edge-muted/50">
        <button
          type="button"
          class="h-7 px-2.5 rounded-md text-[12px] font-medium bg-accent/18 text-accent hover:bg-accent/24 transition-colors"
          onClick={() => setCreateMenuOpen(true)}
        >
          New
        </button>
        <button
          type="button"
          class="size-7 rounded-md grid place-items-center text-ink-muted hover:bg-hover/50 hover:text-ink transition-colors"
          onClick={() => setIsGlobalSidebarCollapsed(true)}
          aria-label="Collapse sidebar"
        >
          <CaretLeft class="size-4" />
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <Show when={isLoading()}>
          <div class="text-xs text-ink-extra-muted px-2 py-1.5">Loading...</div>
        </Show>

        <button
          type="button"
          class="w-full h-8 rounded-md px-2 text-[13px] text-left text-ink-muted hover:bg-hover/40 hover:text-ink transition-colors flex items-center gap-1.5"
          onClick={() => setPinnedItemsExpanded((prev) => !prev)}
        >
          <Show when={pinnedItemsExpanded()} fallback={<CaretRight class="size-3.5" />}>
            <CaretDown class="size-3.5" />
          </Show>
          <ListIcon class="size-3.5 opacity-80" />
          <span class="flex-1">Pinned Items</span>
          <span class="min-w-5 h-5 rounded bg-hover/50 px-1.5 text-[11px] leading-5 text-center text-ink-extra-muted">
            {SAVED_VIEWS.length}
          </span>
        </button>

        <Show when={pinnedItemsExpanded()}>
          <div class="ml-4 pl-3 border-l border-edge-muted/50">
            <For each={SAVED_VIEWS}>
              {(view) => (
                <button
                  type="button"
                  class="w-full h-8 rounded-md px-2 text-[13px] text-left transition-colors text-ink-muted hover:bg-hover/40 hover:text-ink flex items-center gap-2"
                  classList={{
                    'bg-hover/50 text-ink font-medium': activeViewId() === view.id,
                  }}
                  onClick={() => openView(view.id, view.label)}
                >
                  <view.icon class="size-3.5 opacity-80" />
                  <span>{view.label}</span>
                </button>
              )}
            </For>
          </div>
        </Show>

        <button
          type="button"
          class="w-full h-8 rounded-md px-2 text-[13px] text-left text-ink-muted hover:bg-hover/40 hover:text-ink transition-colors flex items-center gap-1.5"
          onClick={() => setPinnedDocsExpanded((prev) => !prev)}
        >
          <Show when={pinnedDocsExpanded()} fallback={<CaretRight class="size-3.5" />}>
            <CaretDown class="size-3.5" />
          </Show>
          <ListIcon class="size-3.5 opacity-80" />
          <span class="flex-1">Pinned Docs</span>
          <span class="min-w-5 h-5 rounded bg-hover/50 px-1.5 text-[11px] leading-5 text-center text-ink-extra-muted">
            {pinnedDocs().length}
          </span>
        </button>

        <Show when={pinnedDocsExpanded()}>
          <div class="ml-4 pl-3 border-l border-edge-muted/50">
            <For each={pinnedDocs()}>
              {(item) => (
                <ListEntity
                  entity={item.entity}
                  displayMode="skinny"
                  onClick={() => {
                    const splitHandle = getActiveSplitHandle();
                    if (!splitHandle) return;
                    openEntityInSplitFromUnifiedList(item.entity, { splitHandle });
                  }}
                />
              )}
            </For>
          </div>
        </Show>

        <Show when={!isLoading() && pinnedDocsExpanded() && pinnedDocs().length === 0}>
          <div class="text-xs text-ink-extra-muted px-2 py-1">No pinned docs</div>
        </Show>

        <button
          type="button"
          class="w-full h-8 rounded-md px-2 text-[13px] text-left text-ink-muted hover:bg-hover/40 hover:text-ink transition-colors flex items-center gap-1.5"
          onClick={() => setChannelsExpanded((prev) => !prev)}
        >
          <Show when={channelsExpanded()} fallback={<CaretRight class="size-3.5" />}>
            <CaretDown class="size-3.5" />
          </Show>
          <UserCircleIcon class="size-3.5 opacity-80" />
          <span class="flex-1">Channels</span>
          <span class="min-w-5 h-5 rounded bg-hover/50 px-1.5 text-[11px] leading-5 text-center text-ink-extra-muted">
            {channels().length}
          </span>
        </button>

        <Show when={channelsExpanded()}>
          <div class="ml-4 pl-3 border-l border-edge-muted/50">
            <For each={visibleChannels()}>
              {(entity) => (
                <ListEntity
                  entity={entity}
                  displayMode="skinny"
                  onClick={() => {
                    const splitHandle = getActiveSplitHandle();
                    if (!splitHandle) return;
                    openEntityInSplitFromUnifiedList(entity, { splitHandle });
                  }}
                />
              )}
            </For>

            <Show when={channels().length > 20}>
              <button
                type="button"
                class="mt-1 h-7 px-2 rounded-md text-xs text-ink-muted hover:text-ink hover:bg-hover/40 transition-colors"
                onClick={() => setShowAllChannels((prev) => !prev)}
              >
                {showAllChannels() ? 'Show less' : 'Show more'}
              </button>
            </Show>
          </div>
        </Show>

        <Show when={!isLoading() && channelsExpanded() && channels().length === 0}>
          <div class="text-xs text-ink-extra-muted px-2 py-1">No channels</div>
        </Show>
      </div>
    </div>
  );
}
