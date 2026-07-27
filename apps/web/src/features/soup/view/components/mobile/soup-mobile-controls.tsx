import { SoupViewCreateButton } from '@app/features/soup/view/components/soup-view-create-button';
import { useSoupView } from '@app/features/soup/view/context';
import { PillTabs } from '@components/app/mobile/PillTabs';
import { isMobile } from '@core/mobile/isMobile';
import SearchIcon from '@phosphor/magnifying-glass.svg';
import { Button, Layer } from '@ui';
import { Show } from 'solid-js';
import { VIEW_TAB_LISTS } from '../../tabs';
import { SoupSearchFacets } from '../../views/search/search-facets';
import { SoupSearchbar } from '../soup-searchbar';
import { SoupMobileFilterDrawer } from './soup-mobile-filter-drawer';

function SoupMobileControlsContent() {
  const {
    applyTabPreset,
    collection,
    openSearch,
    searchOpen,
    setSearchOpen,
    setViewMode,
    tabs,
    view,
    viewMode,
  } = useSoupView();

  return (
    <div class="z-floating hidden shrink-0 flex-col gap-2 px-2 pb-2 pt-[calc(var(--mobile-content-inset-top,0px)+0.5rem)] mobile:flex">
      <Show
        when={view() === 'companies'}
        fallback={
          <Show when={tabs().length > 0}>
            <PillTabs
              items={tabs()}
              value={collection.state.activeTab}
              onChange={applyTabPreset}
              class="pointer-events-auto"
            />
          </Show>
        }
      >
        <PillTabs
          items={VIEW_TAB_LISTS.companies}
          value={viewMode()}
          onChange={(value) => setViewMode(value === 'list' ? 'list' : 'board')}
          class="pointer-events-auto"
        />
      </Show>
      <Show
        when={searchOpen()}
        fallback={
          <Layer depth={3}>
            <div class="pointer-events-auto flex min-w-0 items-center gap-1 rounded-xl border border-edge-muted bg-surface p-1 shadow-sm">
              <Button
                variant="ghost"
                size="icon-sm"
                label="Search"
                onClick={() => openSearch()}
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
              onDismiss={() => setSearchOpen(false)}
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
