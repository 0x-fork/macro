import { useSoupView } from '@app/features/next-soup/soup-view/soup-view-context';
import { TOKENS } from '@core/hotkey/tokens';
import SortIcon from '@phosphor/sort-ascending.svg';
import type { SearchSort } from '@service-search/generated/models';
import { Dropdown, SingleSelectCheck, Tooltip } from '@ui';
import { For } from 'solid-js';

interface SearchSortOption {
  value: SearchSort;
  label: string;
}

const SEARCH_SORT_OPTIONS: SearchSortOption[] = [
  { value: 'updated_at', label: 'Recently updated' },
  { value: 'relevancy', label: 'Best match' },
];

interface SearchSortDropdownProps {
  /** Controlled open state (optional - uses internal state if not provided) */
  open?: boolean;
  /** Controlled open state setter (optional - uses internal state if not provided) */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Sort control for the search results view. Unlike `SoupViewContextSort`'s
 * other views (which reorder an already-fetched client-side entity pool),
 * this toggles the `sort` field on the backend search request itself, so it
 * changes what the current page of results contains, not just their local
 * order.
 */
export const SearchSortDropdown = (props: SearchSortDropdownProps) => {
  const { searchSort, setSearchSort } = useSoupView();

  return (
    <Dropdown
      open={props.open}
      onOpenChange={props.onOpenChange}
      placement="bottom-start"
    >
      <Tooltip label="Sort" hotkey={TOKENS.soup.sort}>
        <Dropdown.Trigger depth={2} class="bg-surface">
          <SortIcon />
          <span>Sort</span>
        </Dropdown.Trigger>
      </Tooltip>
      <Dropdown.Content class="shadow-menu">
        <Dropdown.Group>
          <For each={SEARCH_SORT_OPTIONS}>
            {(option) => (
              <Dropdown.Item onSelect={() => setSearchSort(option.value)}>
                <span class="flex-1 truncate">{option.label}</span>
                <SingleSelectCheck active={searchSort() === option.value} />
              </Dropdown.Item>
            )}
          </For>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
};
