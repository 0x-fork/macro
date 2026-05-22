import { isMobile } from '@core/mobile/isMobile';
import SearchIcon from '@icon/macro-magnifying-glass.svg';
import { Button, cn } from '@ui';
import { createSignal, Show } from 'solid-js';
import { ActiveFilterChips } from './active-filter-chips';
import { SoupSearchbar } from './soup-view-search-bar';
import { useFilterRefinements } from './use-filter-refinements';
import { ViewOptionsPopover } from './view-options-popover';
import {
  CollapsedSoupViewTabs,
  SoupViewTabs,
} from '../soup-view-tabs';
import { CollapsibleHeaderItem } from '@app/component/split-layout/components/CollapsibleHeaderItem';

interface SoupFiltersBarProps {
  hideSelectAll?: boolean;
  hideSearch?: boolean;
  searchView?: boolean;
  initialSearchText?: string;
}

export const SoupFiltersBar = (props: SoupFiltersBarProps = {}) => {
  const [searchExpanded, setSearchExpanded] = createSignal(false);

  const {
    resetToTabDefaults,
    activeFiltersList,
    isOptionActive,
    replaceFilter,
    removeFilter,
  } = useFilterRefinements();

  const hasActiveFilters = () => activeFiltersList().length > 0;

  return (
    <Show when={!isMobile()}>
      <div class="@container/filters flex flex-col w-full gap-2 py-2">
        <Show when={props.searchView}>
          <div class="mx-2">
            <SoupSearchbar
              variant="filled"
              placeholder="Search, @mention contacts"
              initialValue={props.initialSearchText}
              class="py-3 shadow-sm"
            />
          </div>
        </Show>
        <div class="mx-2 rounded-lg">
          <div
            class={cn(
              'flex flex-col gap-1.5 px-2',
              hasActiveFilters() ? 'rounded-t-lg' : 'rounded-lg'
            )}
          >
            <div class="flex items-center gap-2">
              <Show when={!props.searchView}>
                <CollapsibleHeaderItem
                  id="filters-tabs"
                  priority={1}
                  expanded={() => <SoupViewTabs />}
                  collapsed={() => <CollapsedSoupViewTabs />}
                  containerClass="h-full"
                />
              </Show>
              <div class="flex-1" />
              <Show when={!props.searchView && !props.hideSearch}>
                <Show
                  when={!searchExpanded()}
                  fallback={
                    <div class="w-52">
                      <SoupSearchbar
                        variant="filled"
                        autoFocus
                        onDismiss={() => setSearchExpanded(false)}
                      />
                    </div>
                  }
                >
                  <div class="flex items-center gap-1">
                    <div class="hidden @xl/filters:block w-52">
                      <SoupSearchbar variant="filled" />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="@xl/filters:hidden"
                      onClick={() => setSearchExpanded(true)}
                    >
                      <SearchIcon />
                    </Button>
                  </div>
                </Show>
              </Show>
              <ViewOptionsPopover />
            </div>
          </div>
          <Show when={hasActiveFilters()}>
            <div class="px-2 py-1.5 border-t border-edge-muted/30 rounded-b-lg">
              <ActiveFilterChips
                filters={activeFiltersList()}
                onRemove={removeFilter}
                onReplace={replaceFilter}
                onClearAll={resetToTabDefaults}
                isOptionActive={isOptionActive}
              />
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
