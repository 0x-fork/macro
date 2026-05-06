import { SoupViewCreateButton } from '@app/component/next-soup/soup-view/soup-view-create-button';
import { useFilterRefinements } from '@app/component/next-soup/soup-view/filters-bar/use-filter-refinements';
import { createSignal, Show } from 'solid-js';
import { ActiveFilterChips } from '@app/component/next-soup/soup-view/filters-bar/active-filter-chips';
import { isMobile } from '@core/mobile/isMobile';
import { Button } from '@ui/components/Button';
import { SoupSearchbar } from './soup-view-search-bar';
import { ViewOptionsPopover } from './view-options-popover';
import CheckIcon from '@icon/regular/check.svg';
import MinusIcon from '@icon/regular/minus.svg';
import SearchIcon from '@macro-icons/macro-magnifying-glass.svg';
import { useSoup } from '../../soup-context';
import { useAnalytics } from '@app/component/analytics-context';
import { CommandState } from '@app/component/command/state';
import { Checkbox } from '@kobalte/core/checkbox';
import { cn } from '@ui/utils/classname';
import TrashIcon from '@icon/regular/trash.svg';
import ArchiveIcon from '@icon/regular/archive.svg';
import DotsThreeIcon from '@icon/regular/dots-three.svg';

export const SoupFiltersBar = () => {
  const {
    resetToTabDefaults,
    activeFiltersList,
    removeFilter,
    replaceFilter,
    isOptionActive,
  } = useFilterRefinements();

  const soup = useSoup();
  const analytics = useAnalytics();

  const [searchExpanded, setSearchExpanded] = createSignal(false);

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

  return (
    <Show when={!isMobile()}>
      <div class="@container flex flex-col w-full">
        <div class="flex items-center gap-2 w-full px-4 py-1.5">
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
                  : 'border-edge-muted hover:border-accent'
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
              <span class="@md:hidden">{selectionCount()}</span>
              <span class="hidden @md:inline">{selectionCount()} Selected</span>
            </span>
            <div class="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                class="rounded-xs [&_svg]:size-4"
                onClick={handleOpenActions}
              >
                <ArchiveIcon />
                <span class="hidden @lg:inline">Archive</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="rounded-xs [&_svg]:size-4"
                onClick={handleOpenActions}
              >
                <TrashIcon />
                <span class="hidden @lg:inline">Trash</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="rounded-xs [&_svg]:size-4"
                onClick={handleOpenActions}
              >
                <DotsThreeIcon />
                <span class="hidden @lg:inline">More</span>
              </Button>
            </div>
          </Show>
          <div class="flex-1" />
          <Show
            when={searchExpanded()}
            fallback={
              <>
                <div class="hidden @md:block w-52 min-w-32 shrink">
                  <SoupSearchbar variant="filled" />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  class="@md:hidden rounded-xs p-1.5 [&_svg]:size-4 aspect-square"
                  onClick={() => setSearchExpanded(true)}
                >
                  <SearchIcon />
                </Button>
              </>
            }
          >
            <div class="w-56 shrink-0">
              <SoupSearchbar
                variant="filled"
                autoFocus
                onDismiss={() => setSearchExpanded(false)}
              />
            </div>
          </Show>
          <Show when={!searchExpanded()}>
            <ViewOptionsPopover />
            <SoupViewCreateButton />
          </Show>
        </div>
        <Show when={activeFiltersList().length > 0}>
          <div class="px-4 pb-1.5">
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
    </Show>
  );
};
