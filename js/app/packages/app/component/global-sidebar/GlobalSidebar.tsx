import { useGlobalSidebarItems } from '@app/component/next-soup/sidebar/useGlobalSidebarItems';
import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import {
  setIsGlobalSidebarCollapsed,
} from '@core/signal/layout/globalSidebar';
import { getActiveSplitHandle } from './pinnedActions';
import CaretLeft from '@icon/regular/caret-left.svg';
import { ListEntity } from '@entity';
import { createMemo, createSignal, For, Show } from 'solid-js';

export function GlobalSidebar() {
  const { frecencyItems, isLoading } = useGlobalSidebarItems();
  const [searchText, setSearchText] = createSignal('');

  const normalizedSearch = createMemo(() => searchText().trim().toLowerCase());
  const matches = (text: string) =>
    normalizedSearch().length === 0 ||
    text.toLowerCase().includes(normalizedSearch());

  const filteredFrecencyItems = createMemo(() =>
    frecencyItems().filter((item) => matches(item.entity.name))
  );

  return (
    <div class="size-full bg-panel border-r border-edge-muted/50 flex flex-col min-h-0">
      <div class="h-10 px-2 flex items-center justify-end border-b border-edge-muted/50">
        <button
          type="button"
          class="size-6 rounded-md grid place-items-center text-ink-muted hover:bg-hover/40"
          onClick={() => setIsGlobalSidebarCollapsed(true)}
          aria-label="Collapse sidebar"
        >
          <CaretLeft class="size-4" />
        </button>
      </div>
      <div class="px-1 py-1 border-b border-edge-muted/50">
        <input
          type="text"
          value={searchText()}
          onInput={(e) => setSearchText(e.currentTarget.value)}
          placeholder="Search"
          class="w-full h-8 rounded-md bg-hover/30 text-sm px-2 outline-none focus:bg-hover/50"
        />
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-0">
        <Show when={isLoading()}>
          <div class="text-sm text-ink-extra-muted px-0 py-1.5">Loading...</div>
        </Show>

        <For each={filteredFrecencyItems()}>
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
    </div>
  );
}
