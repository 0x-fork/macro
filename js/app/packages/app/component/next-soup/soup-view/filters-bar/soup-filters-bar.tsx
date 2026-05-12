import { createSignal, Show } from 'solid-js';
import { isMobile } from '@core/mobile/isMobile';
import { Button } from '@ui/components/Button';
import CheckIcon from '@icon/regular/check.svg';
import MinusIcon from '@icon/regular/minus.svg';
import { useSoup } from '../../soup-context';
import { useAnalytics } from '@app/component/analytics-context';
import { CommandState } from '@app/component/command/state';
import { Checkbox } from '@kobalte/core/checkbox';
import { cn } from '@ui/utils/classname';
import TrashIcon from '@icon/regular/trash.svg';
import ArchiveIcon from '@icon/regular/archive.svg';
import DotsThreeIcon from '@icon/regular/dots-three.svg';
import SearchIcon from '@macro-icons/macro-magnifying-glass.svg';
import { SoupSearchbar } from './soup-view-search-bar';
import { ViewOptionsPopover } from './view-options-popover';
import { ActiveFilterChips } from './active-filter-chips';
import { useFilterRefinements } from './use-filter-refinements';

interface SoupFiltersBarProps {
  hideSelectAll?: boolean;
  hideSearch?: boolean;
  searchView?: boolean;
  initialSearchText?: string;
}

export const SoupFiltersBar = (props: SoupFiltersBarProps = {}) => {
  const soup = useSoup();
  const analytics = useAnalytics();

  const selectionCount = () => soup.selection.count();
  const totalCount = () => soup.data().length;
  const hasSelection = () => selectionCount() > 0;
  const isAllSelected = () =>
    totalCount() > 0 && selectionCount() === totalCount();
  const isIndeterminate = () => hasSelection() && !isAllSelected();

  const handleSelectAllChange = (checked: boolean) => {
    if (checked) {
      soup.selection.set(soup.data());
    } else {
      soup.selection.clear();
    }
  };

  const handleOpenActions = () => {
    const selected = soup.selection.selected();
    if (selected.length === 0) return;
    analytics.track('command_menu_open', { from: 'filters_bar_bulk_action' });
    CommandState.openForEntityAction(selected);
  };

  const [searchExpanded, setSearchExpanded] = createSignal(false);

  const {
    resetToTabDefaults,
    activeFiltersList,
    removeFilter,
    replaceFilter,
    isOptionActive,
  } = useFilterRefinements();

  const hasActiveFilters = () => activeFiltersList().length > 0;

  return (
    <Show when={!isMobile()}>
      <div class="@container/filters flex flex-col w-full pt-2 pb-3 gap-2">
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
          <div class={cn(
            'flex flex-col gap-1.5 px-2 pt-1.5 bg-ink/5',
            hasActiveFilters() ? 'rounded-t-lg' : 'rounded-lg pb-1.5'
          )}>
          <div class="flex items-center gap-2">
          <Show when={!props.hideSelectAll}>
            <Checkbox
              checked={isAllSelected()}
              indeterminate={isIndeterminate()}
              onChange={handleSelectAllChange}
              class="flex items-center"
            >
              <Checkbox.Input class="sr-only" />
              <Checkbox.Control
                class={cn(
                  'size-4 flex items-center justify-center rounded-xs border transition-colors cursor-pointer',
                  hasSelection()
                    ? 'bg-accent border-accent'
                    : 'border-ink/20 hover:border-accent'
                )}
              >
                <Checkbox.Indicator forceMount>
                  <Show
                    when={isIndeterminate()}
                    fallback={
                      <CheckIcon
                        class={cn(
                          'size-3',
                          isAllSelected() ? 'text-page' : 'text-transparent'
                        )}
                      />
                    }
                  >
                    <MinusIcon class="size-3 text-page" />
                  </Show>
                </Checkbox.Indicator>
              </Checkbox.Control>
            </Checkbox>
            <Show
              when={hasSelection()}
              fallback={
                <span class="text-sm text-ink-muted whitespace-nowrap">Select all</span>
              }
            >
              <span class="text-sm font-medium text-ink">
                <span class="@md/filters:hidden">{selectionCount()}</span>
                <span class="hidden @md/filters:inline">{selectionCount()} Selected</span>
              </span>
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenActions}
                >
                  <ArchiveIcon />
                  <span class="hidden @lg/filters:inline">Archive</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenActions}
                >
                  <TrashIcon />
                  <span class="hidden @lg/filters:inline">Trash</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenActions}
                >
                  <DotsThreeIcon />
                  <span class="hidden @lg/filters:inline">More</span>
                </Button>
              </div>
            </Show>
          </Show>
          <Show
            when={props.searchView}
            fallback={
              <>
                <div class="flex-1" />
                <Show when={!props.hideSearch}>
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
              </>
            }
          >
            <div class="flex-1" />
          </Show>
          <ViewOptionsPopover />
          </div>
        </div>
        <Show when={hasActiveFilters()}>
          <div class="px-2 py-1.5 bg-ink/[0.03] border-t border-edge-muted/30 rounded-b-lg">
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
};
