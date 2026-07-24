import { LIST_VIEW_DOCS_URL } from '@app/constants/docs-links';
import { useSoup } from '@app/features/next-soup/soup-context';
import { GroupDropdown } from '@app/features/next-soup/soup-view/filters-bar/group-dropdown';
import { SortDropdown } from '@app/features/next-soup/soup-view/filters-bar/sort-dropdown';
import type { GroupOptionId } from '@app/features/next-soup/soup-view/group-options';
import type { SystemSortOption } from '@app/features/next-soup/soup-view/sort-options';
import { SoupViewCreateButton } from '@app/features/next-soup/soup-view/soup-view-create-button';
import { openEntityInSplitFromUnifiedList } from '@app/features/next-soup/utils';
import { useSoupView } from '@app/features/soup-view/context';
import { CollapsibleHeaderItem } from '@components/app/split-layout/components/CollapsibleHeaderItem';
import { PreviewButton } from '@components/app/split-layout/components/PreviewButton';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@components/app/split-layout/components/SplitHeader';
import {
  SplitToolbarLeft,
  SplitToolbarRight,
} from '@components/app/split-layout/components/SplitToolbar';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { TabsInset } from '@core/component/TabsInset';
import { TabsInsetDropdown } from '@core/component/TabsInsetDropdown';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { isMobile } from '@core/mobile/isMobile';
import { openExternalUrl } from '@core/util/url';
import InfoIcon from '@phosphor/info.svg';
import SearchIcon from '@phosphor/magnifying-glass.svg';
import { Button, Layer, Tooltip } from '@ui';
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from 'solid-js';

import { SoupActiveFacets } from '../filters/soup-active-facets';
import { SoupSearchbar } from '../filters/soup-searchbar';
import { UnifiedFilterDropdown } from '../filters/unified-filter-dropdown';
import {
  CompanyDisplayMenu,
  CompanyViewsMenu,
} from '../list-views/views/companies/company-views-menu';
import { SoupSearchFacets } from '../list-views/views/search/soup-search-facets';
import { showSoupSort, useIsNewInbox } from '../utils';
import { SoupInboxSelector } from './soup-inbox-selector';
import {
  COMPANY_MODE_TABS,
  soupGroupOptions,
  soupSortOptions,
} from './soup-view-options';

export function SoupViewHeader() {
  const {
    applyTabPreset,
    collection,
    defaultTab,
    focusSearch,
    openSearch,
    searchOpen,
    setSearchOpen,
    setSortOpen,
    setViewMode,
    sortOpen,
    tabs,
    view,
    viewMode,
    viewName,
  } = useSoupView();
  const panel = useSplitPanelOrThrow();
  const soup = useSoup();
  const isNewInbox = useIsNewInbox();
  const [groupOpen, setGroupOpen] = createSignal(false);
  const [searchCollapsed, setSearchCollapsed] = createSignal(false);
  const docsUrl = () => LIST_VIEW_DOCS_URL[view()];
  const activeSort = () =>
    (collection.state.sort[0]?.id as SystemSortOption | undefined) ??
    'updated_at';
  const activeGroup = () =>
    (collection.state.groupBy as GroupOptionId | undefined) ?? 'none';

  const searchHotkey = registerHotkey({
    hotkey: 'cmd+f',
    hotkeyToken: TOKENS.soup.openSearch,
    scopeId: panel.splitHotkeyScope,
    registrationType: 'add',
    description: 'Search',
    runWithInputFocused: true,
    keyDownHandler: () => {
      if (searchOpen()) {
        focusSearch(true);
      } else if (isMobile() || searchCollapsed()) {
        openSearch(true);
      } else {
        focusSearch(true);
      }
      return true;
    },
  });
  onCleanup(searchHotkey.dispose);

  const hasPreviewItems = createMemo(() =>
    collection.dataSource.items().some((row) => row.kind === 'entity')
  );
  const openFocusedEntityInPreview = () => {
    const row = soup.list.focus.item();
    if (row?.kind !== 'entity') return;
    void openEntityInSplitFromUnifiedList(row.entity, {
      splitHandle: panel.handle,
      referredFrom: view(),
    });
  };

  createEffect(() => {
    if (collection.dataSource.isLoading() || hasPreviewItems()) return;
    if (panel.handle.isControllerSplit()) panel.handle.disengagePreview();
  });

  let initialInboxPreviewResolved = false;
  createEffect(() => {
    if (initialInboxPreviewResolved || collection.dataSource.isLoading()) {
      return;
    }
    initialInboxPreviewResolved = true;
    if (view() !== 'inbox') return;
    if (panel.handle.lastNavigationCause() !== 'fresh') return;
    if (panel.handle.isViewerSplit() || !hasPreviewItems()) return;
    panel.handle.engagePreview();
    if (panel.handle.isControllerSplit()) openFocusedEntityInPreview();
  });

  const expandedTabs = () =>
    view() === 'companies' ? (
      <TabsInset
        list={COMPANY_MODE_TABS}
        value={viewMode()}
        defaultValue="board"
        onChange={(value) => setViewMode(value === 'list' ? 'list' : 'board')}
      />
    ) : (
      <TabsInset
        list={tabs()}
        value={collection.state.activeTab}
        defaultValue={defaultTab()}
        onChange={applyTabPreset}
      />
    );
  const collapsedTabs = () =>
    view() === 'companies' ? (
      <TabsInsetDropdown
        list={COMPANY_MODE_TABS}
        value={viewMode()}
        defaultValue="board"
        onChange={(value) => setViewMode(value === 'list' ? 'list' : 'board')}
      />
    ) : (
      <TabsInsetDropdown
        list={tabs()}
        value={collection.state.activeTab}
        defaultValue={defaultTab()}
        onChange={applyTabPreset}
      />
    );

  return (
    <div class="flex w-full shrink-0 flex-col">
      <SplitHeaderLeft>
        <div class="flex h-full min-w-0 items-center gap-3">
          <Show when={!isMobile() && !searchOpen()}>
            <div class="flex shrink-0 items-center gap-1">
              <span class="text-sm font-semibold">{viewName()}</span>
              <Show when={docsUrl()}>
                {(url) => (
                  <Tooltip label="View documentation">
                    <Button
                      variant="ghost"
                      class="rounded-sm p-0.5 text-ink-extra-muted hover:text-ink-muted"
                      label="View documentation"
                      onClick={() => openExternalUrl(url())}
                    >
                      <InfoIcon class="size-3.5" />
                    </Button>
                  </Tooltip>
                )}
              </Show>
            </div>
          </Show>
          <Show
            when={
              !searchOpen() && (view() === 'companies' || tabs().length > 0)
            }
          >
            <CollapsibleHeaderItem
              id="tabs"
              priority={1}
              containerClass="h-full"
              expanded={expandedTabs}
              collapsed={collapsedTabs}
            />
          </Show>
          <Show when={!searchOpen() && view() === 'mail'}>
            <CollapsibleHeaderItem
              id="inbox"
              priority={3}
              expanded={() => <SoupInboxSelector />}
              collapsed={() => <SoupInboxSelector compact />}
            />
          </Show>
        </div>
      </SplitHeaderLeft>

      <Show when={!isMobile()}>
        <SplitHeaderRight>
          <Show
            when={searchOpen()}
            fallback={
              <>
                <Show when={view() !== 'search'}>
                  <SoupViewCreateButton view={view()} />
                </Show>
                <Show when={view() === 'companies'}>
                  <CompanyViewsMenu />
                  <CompanyDisplayMenu />
                </Show>
                <Show
                  when={view() === 'search'}
                  fallback={
                    <CollapsibleHeaderItem
                      id="search"
                      priority={0}
                      onCollapsedChange={setSearchCollapsed}
                      expanded={() => (
                        <Layer depth={2}>
                          <div class="w-60 ml-2">
                            <SoupSearchbar variant="secondary" />
                          </div>
                        </Layer>
                      )}
                      collapsed={() => (
                        <Tooltip label="Search" hotkey={TOKENS.soup.openSearch}>
                          <Button
                            variant="base"
                            size="icon-sm"
                            depth={2}
                            class="bg-surface"
                            label="Search"
                            onClick={() => openSearch()}
                          >
                            <SearchIcon />
                          </Button>
                        </Tooltip>
                      )}
                    />
                  }
                >
                  <Layer depth={2}>
                    <div class="grow ml-2 min-w-0 [contain:inline-size]">
                      <SoupSearchbar
                        variant="secondary"
                        placeholder="Search, @mention contacts"
                      />
                    </div>
                  </Layer>
                </Show>
              </>
            }
          >
            <Layer depth={2}>
              <div class="flex-1 min-w-0">
                <SoupSearchbar
                  variant="secondary"
                  autoFocus
                  onDismiss={() => setSearchOpen(false)}
                />
              </div>
            </Layer>
          </Show>
        </SplitHeaderRight>

        <SplitToolbarLeft>
          <div class="flex min-w-0 flex-1 items-center gap-1">
            <Show
              when={view() === 'search'}
              fallback={<UnifiedFilterDropdown />}
            >
              <SoupSearchFacets />
            </Show>
            <Show when={showSoupSort(view(), isNewInbox())}>
              <SortDropdown
                value={activeSort}
                onChange={(id) =>
                  collection.setState('sort', [{ id, reversed: false }])
                }
                options={soupSortOptions(view())}
                open={sortOpen()}
                onOpenChange={setSortOpen}
              />
            </Show>
            <Show when={soupGroupOptions(view()).length > 0}>
              <GroupDropdown
                value={activeGroup}
                onChange={(id) => {
                  collection.setState(
                    'groupBy',
                    id === 'none' ? undefined : id
                  );
                  collection.collapsedGroups.expandAll();
                }}
                options={soupGroupOptions(view())}
                open={groupOpen()}
                onOpenChange={setGroupOpen}
              />
            </Show>
          </div>
        </SplitToolbarLeft>
        <SplitToolbarRight>
          <PreviewButton
            disabled={!hasPreviewItems()}
            disabledLabel="No items to preview"
            onEngage={openFocusedEntityInPreview}
          />
        </SplitToolbarRight>
      </Show>

      <Show when={!isMobile() && view() !== 'search'}>
        <SoupActiveFacets />
      </Show>
    </div>
  );
}
