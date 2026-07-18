import { SoupViewCreateButton } from '@app/features/next-soup/soup-view/soup-view-create-button';
import { useSoupCollection } from '@app/features/soup-list';
import { PillTabs } from '@components/app/mobile/PillTabs';
import SearchIcon from '@phosphor/magnifying-glass.svg';
import XIcon from '@phosphor/x.svg';
import { Button, Layer } from '@ui';
import { onCleanup, Show } from 'solid-js';
import { useSoupView } from '../context';
import { SoupSearchFacets } from '../list-views/views/search/soup-search-facets';
import { SoupMobileFilterDrawer } from './soup-mobile-filter-drawer';

function MobileSearchInput() {
  const collection = useSoupCollection();
  const view = useSoupView();
  let input: HTMLInputElement | undefined;

  onCleanup(() => {
    if (view.searchInput() === input) view.setSearchInput(undefined);
  });

  return (
    <input
      ref={(element) => {
        input = element;
        view.setSearchInput(element);
      }}
      value={collection.search()}
      onInput={(event) => collection.setSearch(event.currentTarget.value)}
      class="h-7 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
      placeholder="Search"
      aria-label="Search"
      autofocus
    />
  );
}

export function SoupMobileControls() {
  const collection = useSoupCollection();
  const viewState = useSoupView();
  const view = viewState.view;

  return (
    <div class="z-floating hidden shrink-0 flex-col gap-2 px-2 pb-2 pt-[calc(var(--mobile-content-inset-top,0px)+0.5rem)] mobile:flex">
      <Show when={viewState.tabs().length > 0}>
        <PillTabs
          items={viewState.tabs()}
          value={collection.activeTab()}
          onChange={viewState.applyTabPreset}
          class="pointer-events-auto"
        />
      </Show>
      <Layer depth={3}>
        <div class="pointer-events-auto flex min-w-0 items-center gap-1 rounded-xl border border-edge-muted bg-surface p-1 shadow-sm">
          <Show
            when={viewState.searchOpen()}
            fallback={
              <Button
                variant="ghost"
                size="icon-sm"
                label="Search"
                onClick={() => viewState.openSearch()}
              >
                <SearchIcon />
              </Button>
            }
          >
            <MobileSearchInput />
            <Button
              variant="ghost"
              size="icon-sm"
              label="Close search"
              onClick={() => {
                collection.setSearch('');
                viewState.setSearchOpen(false);
              }}
            >
              <XIcon />
            </Button>
          </Show>
          <Show when={!viewState.searchOpen() && view() !== 'search'}>
            <SoupMobileFilterDrawer />
          </Show>
          <Show when={!viewState.searchOpen() && view() !== 'search'}>
            <SoupViewCreateButton />
          </Show>
        </div>
      </Layer>
      <Show when={view() === 'search'}>
        <div class="pointer-events-auto overflow-x-auto scrollbar-hidden">
          <SoupSearchFacets />
        </div>
      </Show>
    </div>
  );
}
