import { useGlobalSidebarItems } from '@app/component/next-soup/sidebar/useGlobalSidebarItems';
import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { setCreateMenuOpen } from '@app/component/Launcher';
import type { SplitHandle } from '@app/component/split-layout/layoutManager';
import { setSoupFilterMount, setSoupTopControlsMount } from './soup-filter-mount';
import CaretLeft from '@icon/regular/caret-left.svg';
import CaretDown from '@icon/regular/caret-down.svg';
import CaretRight from '@icon/regular/caret-right.svg';
import UserCircleIcon from '@icon/regular/user-circle.svg';
import GroupChannelIcon from '@macro-icons/wide/channel.svg';
import DirectMessageIcon from '@macro-icons/wide/chat.svg';
import { ListEntity } from '@entity';
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';

export function GlobalSidebar(props: {
  splitHandle: SplitHandle;
  onCollapse: () => void;
}) {
  const { channelItems, isLoading } = useGlobalSidebarItems();
  const [groupsExpanded, setGroupsExpanded] = createSignal(true);
  const [dmsExpanded, setDmsExpanded] = createSignal(true);
  const [showAllGroups, setShowAllGroups] = createSignal(false);
  const [showAllDMs, setShowAllDMs] = createSignal(false);

  const groups = createMemo(() =>
    channelItems().filter((entity) => entity.channelType !== 'direct_message')
  );
  const directMessages = createMemo(() =>
    channelItems().filter((entity) => entity.channelType === 'direct_message')
  );

  const visibleGroups = createMemo(() =>
    showAllGroups() ? groups() : groups().slice(0, 20)
  );
  const visibleDMs = createMemo(() =>
    showAllDMs() ? directMessages() : directMessages().slice(0, 20)
  );
  const splitId = () => String(props.splitHandle.id);
  let soupFilterMountRef: HTMLDivElement | undefined;
  let soupTopControlsMountRef: HTMLDivElement | undefined;

  onMount(() => {
    setSoupFilterMount(splitId(), soupFilterMountRef);
    setSoupTopControlsMount(splitId(), soupTopControlsMountRef);
  });

  onCleanup(() => {
    setSoupFilterMount(splitId(), undefined);
    setSoupTopControlsMount(splitId(), undefined);
  });

  return (
    <div class="size-full bg-panel border-r border-edge-muted/60 flex flex-col min-h-0">
      <div class="h-10 px-2 flex items-center justify-between border-b border-edge-muted/50">
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="h-7 px-2.5 rounded-md text-[12px] font-medium bg-accent/18 text-accent hover:bg-accent/24 transition-colors"
            onClick={() => setCreateMenuOpen(true)}
          >
            New
          </button>
          <div ref={soupTopControlsMountRef} class="contents" />
        </div>
        <button
          type="button"
          class="size-7 rounded-md grid place-items-center text-ink-muted hover:bg-hover/50 hover:text-ink transition-colors"
          onClick={props.onCollapse}
          aria-label="Collapse sidebar"
        >
          <CaretLeft class="size-4" />
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <Show when={isLoading()}>
          <div class="text-xs text-ink-extra-muted px-2 py-1.5">Loading...</div>
        </Show>

        <div
          ref={soupFilterMountRef}
          class="w-full"
          data-soup-filter-mount={splitId()}
        />

        <button
          type="button"
          class="w-full h-8 rounded-md px-2 text-[13px] text-left text-ink-muted hover:bg-hover/40 hover:text-ink transition-colors flex items-center gap-1.5"
          onClick={() => setGroupsExpanded((prev) => !prev)}
        >
          <Show when={groupsExpanded()} fallback={<CaretRight class="size-3.5" />}>
            <CaretDown class="size-3.5" />
          </Show>
          <GroupChannelIcon class="size-3.5 opacity-80" />
          <span class="flex-1">Groups</span>
          <span class="min-w-5 h-5 rounded bg-hover/50 px-1.5 text-[11px] leading-5 text-center text-ink-extra-muted">
            {groups().length}
          </span>
        </button>

        <Show when={groupsExpanded()}>
          <div class="ml-4 pl-3 border-l border-edge-muted/50">
            <For each={visibleGroups()}>
              {(entity) => (
                <ListEntity
                  entity={entity}
                  displayMode="skinny"
                  onClick={() => {
                    openEntityInSplitFromUnifiedList(entity, {
                      splitHandle: props.splitHandle,
                    });
                  }}
                />
              )}
            </For>

            <Show when={groups().length > 20}>
              <button
                type="button"
                class="mt-1 h-7 px-2 rounded-md text-xs text-ink-muted hover:text-ink hover:bg-hover/40 transition-colors"
                onClick={() => setShowAllGroups((prev) => !prev)}
              >
                {showAllGroups() ? 'Show less' : 'Show more'}
              </button>
            </Show>
          </div>
        </Show>

        <Show when={!isLoading() && groupsExpanded() && groups().length === 0}>
          <div class="text-xs text-ink-extra-muted px-2 py-1">No groups</div>
        </Show>

        <button
          type="button"
          class="w-full h-8 rounded-md px-2 text-[13px] text-left text-ink-muted hover:bg-hover/40 hover:text-ink transition-colors flex items-center gap-1.5"
          onClick={() => setDmsExpanded((prev) => !prev)}
        >
          <Show when={dmsExpanded()} fallback={<CaretRight class="size-3.5" />}>
            <CaretDown class="size-3.5" />
          </Show>
          <DirectMessageIcon class="size-3.5 opacity-80" />
          <span class="flex-1">Direct Messages</span>
          <span class="min-w-5 h-5 rounded bg-hover/50 px-1.5 text-[11px] leading-5 text-center text-ink-extra-muted">
            {directMessages().length}
          </span>
        </button>

        <Show when={dmsExpanded()}>
          <div class="ml-4 pl-3 border-l border-edge-muted/50">
            <For each={visibleDMs()}>
              {(entity) => (
                <ListEntity
                  entity={entity}
                  displayMode="skinny"
                  onClick={() => {
                    openEntityInSplitFromUnifiedList(entity, {
                      splitHandle: props.splitHandle,
                    });
                  }}
                />
              )}
            </For>

            <Show when={directMessages().length > 20}>
              <button
                type="button"
                class="mt-1 h-7 px-2 rounded-md text-xs text-ink-muted hover:text-ink hover:bg-hover/40 transition-colors"
                onClick={() => setShowAllDMs((prev) => !prev)}
              >
                {showAllDMs() ? 'Show less' : 'Show more'}
              </button>
            </Show>
          </div>
        </Show>

        <Show when={!isLoading() && dmsExpanded() && directMessages().length === 0}>
          <div class="text-xs text-ink-extra-muted px-2 py-1">No direct messages</div>
        </Show>
      </div>
    </div>
  );
}
