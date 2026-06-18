import { isMobile } from '@core/mobile/isMobile';
import { cn } from '@ui';
import { Show } from 'solid-js';
import { ActiveFilterChips } from './active-filter-chips';
import {
  SuggestedFilterChips,
  useSoupViewSuggestedFilters,
} from './soup-view-suggested-filters';
import { useFilterRefinements } from './use-filter-refinements';
import { ViewOptionsPopover } from './view-options-popover';
import { SoupViewTabs } from '../soup-view-tabs';

interface SoupFiltersBarProps {
  hideSelectAll?: boolean;
  hideSearch?: boolean;
  searchView?: boolean;
  initialSearchText?: string;
}

export const SoupFiltersBar = (props: SoupFiltersBarProps = {}) => {
  const {
    resetToTabDefaults,
    activeFiltersList,
    isOptionActive,
    addFilter,
    replaceFilter,
    removeFilter,
  } = useFilterRefinements();

  const suggestedFilters = useSoupViewSuggestedFilters({ isOptionActive });
  const hasActiveFilters = () => activeFiltersList().length > 0;
  const hasSuggestedFilters = () => suggestedFilters().length > 0;

  return (
    <Show when={!isMobile()}>
      <div
        class={cn(
          '@container/filters flex flex-col w-full gap-2',
          props.searchView ? 'py-1' : 'py-2'
        )}
      >
        <Show when={props.searchView}>
          <div class="mx-2 flex items-center justify-end gap-2">
            <ViewOptionsPopover />
          </div>
        </Show>
        <Show
          when={
            !props.searchView || hasActiveFilters() || hasSuggestedFilters()
          }
        >
          <div class="mx-2 rounded-lg">
            <Show when={!props.searchView}>
              <div
                class={cn(
                  'flex flex-col gap-1.5 px-2',
                  hasActiveFilters() ? 'rounded-t-lg' : 'rounded-lg'
                )}
              >
                <div class="flex items-center gap-2">
                  <SoupViewTabs />
                  <ViewOptionsPopover />
                </div>
              </div>
            </Show>
            <Show when={hasActiveFilters() || hasSuggestedFilters()}>
              <div
                class={cn(
                  'px-2 py-1.5',
                  props.searchView ? 'rounded-lg' : 'rounded-b-lg'
                )}
              >
                <div class="flex items-center gap-1.5 flex-wrap">
                  <ActiveFilterChips
                    filters={activeFiltersList()}
                    onAdd={addFilter}
                    onRemove={removeFilter}
                    onReplace={replaceFilter}
                    onClearAll={resetToTabDefaults}
                    isOptionActive={isOptionActive}
                  />
                  <SuggestedFilterChips
                    suggestions={suggestedFilters()}
                    onAdd={addFilter}
                    isOptionActive={isOptionActive}
                  />
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
};
