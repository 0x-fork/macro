import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { createHotkeyGroup, registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { useSoupView } from '../../../context';
import { SearchFacetChip } from './search-facet-chip';
import { useSearchFacets } from './search-facets';

export function SoupSearchFacets() {
  const panel = useSplitPanelOrThrow();
  const view = useSoupView().view;
  const facets = useSearchFacets();
  const [typeMenuOpen, setTypeMenuOpen] = createSignal(false);
  const hotkeys = createHotkeyGroup();

  registerHotkey({
    hotkey: 'f',
    hotkeyToken: TOKENS.soup.filter,
    scopeId: panel.splitHotkeyScope,
    description: 'Filter by type',
    keyDownHandler: () => {
      setTypeMenuOpen(true);
      return true;
    },
  }).withGroup(hotkeys);
  onCleanup(() => hotkeys.dispose());

  return (
    <Show when={view() === 'search'}>
      <div class="flex items-center gap-1.5 flex-wrap min-w-0">
        <For each={facets()}>
          {(facet) => (
            <SearchFacetChip
              facet={facet}
              open={facet.id === 'search_type' ? typeMenuOpen : undefined}
              setOpen={facet.id === 'search_type' ? setTypeMenuOpen : undefined}
            />
          )}
        </For>
      </div>
    </Show>
  );
}
