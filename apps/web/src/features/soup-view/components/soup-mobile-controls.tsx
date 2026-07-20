import { SoupViewCreateButton } from '@app/features/next-soup/soup-view/soup-view-create-button';
import { useSoupCollection } from '@app/features/soup-list';
import { PillTabs } from '@components/app/mobile/PillTabs';
import { isMobile } from '@core/mobile/isMobile';
import SearchIcon from '@phosphor/magnifying-glass.svg';
import { Button, Layer } from '@ui';
import { Show } from 'solid-js';
import { useSoupView } from '../context';
import { SoupSearchbar } from '../filters/soup-searchbar';
import { SoupSearchFacets } from '../list-views/views/search/soup-search-facets';
import { SoupMobileFilterDrawer } from './soup-mobile-filter-drawer';

function SoupMobileControlsContent() {
  const collection = useSoupCollection();
  const viewState = useSoupView();
  const view = viewState.view;

  return (
    <div class="z-floating hidden shrink-0 flex-col gap-2 px-2 pb-2 pt-[calc(var(--mobile-content-inset-top,0px)+0.5rem)] mobile:flex">
      <Show when={viewState.tabs().length > 0}>
        <PillTabs
          items={viewState.tabs()}
          value={collection.state.activeTab}
          onChange={viewState.applyTabPreset}
          class="pointer-events-auto"
        />
      </Show>
      <Show
        when={viewState.searchOpen()}
        fallback={
          <Layer depth={3}>
            <div class="pointer-events-auto flex min-w-0 items-center gap-1 rounded-xl border border-edge-muted bg-surface p-1 shadow-sm">
              <Button
                variant="ghost"
                size="icon-sm"
                label="Search"
                onClick={() => viewState.openSearch()}
              >
                <SearchIcon />
              </Button>
              <Show when={view() !== 'search'}>
                <SoupMobileFilterDrawer />
              </Show>
              <Show when={view() !== 'search'}>
                <SoupViewCreateButton view={view()} />
              </Show>
            </div>
          </Layer>
        }
      >
        <Layer depth={3}>
          <div class="pointer-events-auto min-w-0">
            <SoupSearchbar
              variant="secondary"
              autoFocus
              onDismiss={() => viewState.setSearchOpen(false)}
            />
          </div>
        </Layer>
      </Show>
      <Show when={view() === 'search'}>
        <div class="pointer-events-auto overflow-x-auto scrollbar-hidden">
          <SoupSearchFacets />
        </div>
      </Show>
    </div>
  );
}

export function SoupMobileControls() {
  return (
    <Show when={isMobile()}>
      <SoupMobileControlsContent />
    </Show>
  );
}
