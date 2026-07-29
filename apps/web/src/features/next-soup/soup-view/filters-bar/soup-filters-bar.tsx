import { SearchFiltersRow } from '@app/features/next-soup/soup-view/filters-bar/search/search-filters-row';
import { SoupActiveFiltersBar } from '@app/features/next-soup/soup-view/filters-bar/soup-active-filters-bar';
import { SoupViewContextGroup } from '@app/features/next-soup/soup-view/filters-bar/soup-view-context-group';
import { SoupViewContextSort } from '@app/features/next-soup/soup-view/filters-bar/soup-view-context-sort';
import { useFilterRefinements } from '@app/features/next-soup/soup-view/filters-bar/use-filter-refinements';
import { SplitToolbarLeft } from '@components/app/split-layout/components/SplitToolbar';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { isMobile } from '@core/mobile/isMobile';
import { createMemo, Show } from 'solid-js';

/**
 * Filter, sort, and group controls live in the list panel's master dropdown
 * (see SoupViewSwitcher), so regular list views render no toolbar row here —
 * only the active-filter chips when refinements are applied. The search view
 * keeps its inline filter row and tag views keep their sort/group toolbar.
 */
export function SoupFiltersBar(props: { variant?: 'default' | 'tag' }) {
  const { resetToTabDefaults, consolidatedFiltersList } =
    useFilterRefinements();

  const panel = useSplitPanelOrThrow();

  const isSearchView = createMemo(() => {
    const content = panel.handle.content();
    return content.type === 'component' && content.id === 'search';
  });
  const isTagView = createMemo(() => props.variant === 'tag');

  return (
    <Show when={!isMobile()}>
      <Show when={isSearchView() || isTagView()}>
        <SplitToolbarLeft>
          <div class="flex items-start gap-1 min-w-0 flex-1">
            <Show when={isTagView()} fallback={<SearchFiltersRow />}>
              <SoupViewContextSort />
              <SoupViewContextGroup />
            </Show>
          </div>
        </SplitToolbarLeft>
      </Show>
      {/* Active filters bar - shown below the toolbar when there are filters */}
      <Show when={!isSearchView() && !isTagView()}>
        <SoupActiveFiltersBar
          filters={consolidatedFiltersList()}
          onClearAll={resetToTabDefaults}
        />
      </Show>
    </Show>
  );
}
