import { useAnalytics } from '@app/component/analytics-context';
import { SearchFiltersRow } from '@app/component/next-soup/soup-view/filters-bar/search/search-filters-row';
import { SoupActiveFiltersBar } from '@app/component/next-soup/soup-view/filters-bar/soup-active-filters-bar';
import { SoupViewContextGroup } from '@app/component/next-soup/soup-view/filters-bar/soup-view-context-group';
import { SoupViewContextSort } from '@app/component/next-soup/soup-view/filters-bar/soup-view-context-sort';
import { UnifiedFilterDropdown } from '@app/component/next-soup/soup-view/filters-bar/unified-filter-dropdown';
import { useFilterRefinements } from '@app/component/next-soup/soup-view/filters-bar/use-filter-refinements';
import {
  type FoldersViewMode,
  useSoupView,
} from '@app/component/next-soup/soup-view/soup-view-context';
import {
  SplitToolbarLeft,
  SplitToolbarRight,
} from '@app/component/split-layout/components/SplitToolbar';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { TabsInset } from '@core/component/TabsInset';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { isMobile } from '@core/mobile/isMobile';
import RowsIcon from '@phosphor/rows.svg';
import TreeViewIcon from '@phosphor/tree-view.svg';
import EyeIcon from '@phosphor-icons/core/regular/eye.svg?component-solid';
import EyeSlashIcon from '@phosphor-icons/core/regular/eye-slash.svg?component-solid';
import { Button, Tooltip } from '@ui';
import { createMemo, createSignal, Show } from 'solid-js';
import { useSoup } from '../../soup-context';

export function SoupFiltersBar() {
  const { resetToTabDefaults, consolidatedFiltersList } =
    useFilterRefinements();
  const [filterDropdownOpen, setFilterDropdownOpen] = createSignal(false);

  const panel = useSplitPanelOrThrow();
  const analytics = useAnalytics();
  const soup = useSoup();

  const togglePreview = () => {
    const currentPreview = soup.previewEntity();
    if (currentPreview) {
      soup.setPreviewEntity(undefined);
      return;
    }
    const focused = soup.focus.id();
    if (!focused) {
      return;
    }
    analytics.track('preview_panel_use');
    soup.setPreviewEntity(focused);
  };

  registerHotkey({
    hotkeyToken: TOKENS.unifiedList.togglePreview,
    scopeId: panel.splitHotkeyScope,
    description: 'Toggle preview',
    keyDownHandler: () => {
      togglePreview();
      return true;
    },
    hotkey: 'space',
  });

  const isSearchView = createMemo(() => {
    const content = panel.handle.content();
    return content.type === 'component' && content.id === 'search';
  });

  const isFoldersView = createMemo(() => {
    const content = panel.handle.content();
    return content.type === 'component' && content.id === 'folders';
  });

  const { foldersViewMode, setFoldersViewMode } = useSoupView();

  // Sort/group/filter/preview act on the soup list, which isn't shown while
  // the folders hierarchy tree is active, so hide them in that mode.
  const folderTreeActive = createMemo(
    () => isFoldersView() && foldersViewMode() === 'tree'
  );

  return (
    <Show when={!isMobile()}>
      <SplitToolbarLeft>
        <div class="flex items-start gap-1 min-w-0 flex-1">
          <Show when={!isSearchView()} fallback={<SearchFiltersRow />}>
            <Show when={!folderTreeActive()}>
              <SoupViewContextSort />
              <SoupViewContextGroup />
              <UnifiedFilterDropdown
                open={filterDropdownOpen}
                onOpenChange={setFilterDropdownOpen}
              />
            </Show>
          </Show>
        </div>
      </SplitToolbarLeft>
      <SplitToolbarRight>
        <Show when={isFoldersView()}>
          <TabsInset
            depth={2}
            list={[
              {
                value: 'list',
                label: (
                  <span class="flex items-center gap-1">
                    <RowsIcon class="size-3.5" />
                    List
                  </span>
                ),
              },
              {
                value: 'tree',
                label: (
                  <span class="flex items-center gap-1">
                    <TreeViewIcon class="size-3.5" />
                    Tree
                  </span>
                ),
              },
            ]}
            value={foldersViewMode()}
            onChange={(value) => setFoldersViewMode(value as FoldersViewMode)}
          />
        </Show>
        <Show when={!folderTreeActive()}>
          <Tooltip hotkey={TOKENS.unifiedList.togglePreview} label="Preview">
            <Button
              onClick={togglePreview}
              variant="base"
              size="sm"
              depth={2}
              class="bg-surface"
            >
              {soup.previewEntity() ? <EyeSlashIcon /> : <EyeIcon />}
              <span>Preview</span>
            </Button>
          </Tooltip>
        </Show>
      </SplitToolbarRight>
      {/* Active filters bar - shown below the toolbar when there are filters */}
      <Show when={!isSearchView() && !folderTreeActive()}>
        <SoupActiveFiltersBar
          filters={consolidatedFiltersList()}
          onClearAll={resetToTabDefaults}
        />
      </Show>
    </Show>
  );
}
