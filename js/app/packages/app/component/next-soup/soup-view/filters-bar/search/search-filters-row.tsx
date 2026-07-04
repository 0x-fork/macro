import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { TOKENS } from '@core/hotkey/tokens';
import { createSignal, For } from 'solid-js';
import { useViewHotkeyRegistrar } from '../../view-hotkeys';
import { SearchFacetChip } from './search-facet-chip';
import { useSearchFacets } from './search-facets';
import { createSearchFiltersController } from './search-filters-state';

/**
 * Always-visible filter row for the search view. Renders one chip per facet
 * applicable to the active type.
 */
export function SearchFiltersRow() {
  const controller = createSearchFiltersController();
  const facets = useSearchFacets(controller);
  const panel = useSplitPanelOrThrow();
  const [typeMenuOpen, setTypeMenuOpen] = createSignal(false);

  // View trees are keep-alive parked, not disposed; see view-hotkeys.
  const registerHotkey = useViewHotkeyRegistrar();

  registerHotkey({
    hotkey: 'f',
    scopeId: panel.splitHotkeyScope,
    description: 'Filter by type',
    hotkeyToken: TOKENS.soup.filter,
    keyDownHandler: () => {
      setTypeMenuOpen(true);
      return true;
    },
  });

  return (
    <div class="flex items-center gap-1.5 flex-wrap min-w-0">
      <For each={facets()}>
        {(facet) => (
          <SearchFacetChip
            facet={facet}
            open={facet.id === 'type' ? typeMenuOpen : undefined}
            setOpen={facet.id === 'type' ? setTypeMenuOpen : undefined}
          />
        )}
      </For>
    </div>
  );
}
