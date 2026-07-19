import { LIST_VIEW_DOCS_URL } from '@app/constants/docs-links';
import { GroupDropdown } from '@app/features/next-soup/soup-view/filters-bar/group-dropdown';
import { SortDropdown } from '@app/features/next-soup/soup-view/filters-bar/sort-dropdown';
import type { GroupOptionId } from '@app/features/next-soup/soup-view/group-options';
import type { SystemSortOption } from '@app/features/next-soup/soup-view/sort-options';
import { SoupViewCreateButton } from '@app/features/next-soup/soup-view/soup-view-create-button';
import { useSoupCollection } from '@app/features/soup-list';
import { CollapsibleHeaderItem } from '@components/app/split-layout/components/CollapsibleHeaderItem';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@components/app/split-layout/components/SplitHeader';
import {
  SplitToolbarLeft,
  SplitToolbarRight,
} from '@components/app/split-layout/components/SplitToolbar';
import { createSplitBreakpoints } from '@components/app/split-layout/create-split-breakpoints';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { TabsInset } from '@core/component/TabsInset';
import { TabsInsetDropdown } from '@core/component/TabsInsetDropdown';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { isMobile } from '@core/mobile/isMobile';
import { openExternalUrl } from '@core/util/url';
import InfoIcon from '@phosphor/info.svg';
import SearchIcon from '@phosphor/magnifying-glass.svg';
import XIcon from '@phosphor/x.svg';
import EyeIcon from '@phosphor-icons/core/regular/eye.svg?component-solid';
import EyeSlashIcon from '@phosphor-icons/core/regular/eye-slash.svg?component-solid';
import { Button, Tooltip } from '@ui';
import { createSignal, onCleanup, Show } from 'solid-js';
import { useSoupView } from '../context';
import { SoupActiveFacets } from '../filters/soup-active-facets';
import { SoupFacetFilter } from '../filters/soup-facet-filter';
import {
  CompanyDisplayMenu,
  CompanyViewsMenu,
} from '../list-views/views/companies/company-views-menu';
import { SoupSearchFacets } from '../list-views/views/search/soup-search-facets';
import { showSoupSort, useIsNewInbox } from '../utils';
import { SoupInboxSelector } from './soup-inbox-selector';
import { soupGroupOptions, soupSortOptions } from './soup-view-options';

const COMPANY_MODE_TABS = [
  { value: 'board', label: 'Board' },
  { value: 'list', label: 'List' },
];

const INBOX_READ_TABS = [
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'all', label: 'All' },
];

type SoupReadFilter = 'all' | 'unread' | 'read';

const readFilter = (
  collection: ReturnType<typeof useSoupCollection>
): SoupReadFilter => {
  if (collection.facets.has('read_state', 'read')) return 'read';
  if (collection.facets.has('read_state', 'unread')) return 'unread';
  return 'all';
};

const setReadFilter = (
  collection: ReturnType<typeof useSoupCollection>,
  value: SoupReadFilter
) => collection.facets.set('read_state', value === 'all' ? [] : [value]);

function SoupSearchInput(props: {
  class: string;
  autofocus?: boolean;
  placeholder?: string;
}) {
  const collection = useSoupCollection();
  const view = useSoupView();
  let input: HTMLInputElement | undefined;

  onCleanup(() => {
    if (view.searchInput() === input) view.setSearchInput(undefined);
  });

  return (
    <input
      ref={(element) => {
        input = element;
        view.setSearchInput(element);
      }}
      value={collection.search()}
      onInput={(event) => collection.setSearch(event.currentTarget.value)}
      class={props.class}
      placeholder={props.placeholder ?? 'Search, @mention contacts'}
      aria-label="Search"
      autofocus={props.autofocus}
    />
  );
}

export function SoupViewHeader() {
  const collection = useSoupCollection();
  const viewState = useSoupView();
  const panel = useSplitPanelOrThrow();
  const breakpoints = createSplitBreakpoints({ wide: 640 });
  const view = viewState.view;
  const isNewInbox = useIsNewInbox();
  const [groupOpen, setGroupOpen] = createSignal(false);
  const [searchCollapsed, setSearchCollapsed] = createSignal(false);
  const docsUrl = () => LIST_VIEW_DOCS_URL[view()];
  const activeSort = () =>
    (collection.sort()[0]?.id as SystemSortOption | undefined) ?? 'updated_at';
  const activeGroup = () =>
    (collection.groupBy() as GroupOptionId | undefined) ?? 'none';

  const searchHotkey = registerHotkey({
    hotkey: 'cmd+f',
    hotkeyToken: TOKENS.soup.openSearch,
    scopeId: panel.splitHotkeyScope,
    registrationType: 'add',
    description: 'Search',
    runWithInputFocused: true,
    keyDownHandler: () => {
      if (viewState.searchOpen()) {
        viewState.focusSearch(true);
      } else if (isMobile() || searchCollapsed()) {
        viewState.openSearch(true);
      } else {
        viewState.focusSearch(true);
      }
      return true;
    },
  });
  onCleanup(searchHotkey.dispose);

  const expandedTabs = () =>
    view() === 'companies' ? (
      <TabsInset
        list={COMPANY_MODE_TABS}
        value={viewState.viewMode()}
        defaultValue="board"
        onChange={(value) =>
          viewState.setViewMode(value === 'list' ? 'list' : 'board')
        }
      />
    ) : (
      <TabsInset
        list={viewState.tabs()}
        value={collection.activeTab()}
        defaultValue={viewState.defaultTab()}
        onChange={viewState.applyTabPreset}
      />
    );
  const collapsedTabs = () =>
    view() === 'companies' ? (
      <TabsInsetDropdown
        list={COMPANY_MODE_TABS}
        value={viewState.viewMode()}
        defaultValue="board"
        onChange={(value) =>
          viewState.setViewMode(value === 'list' ? 'list' : 'board')
        }
      />
    ) : (
      <TabsInsetDropdown
        list={viewState.tabs()}
        value={collection.activeTab()}
        defaultValue={viewState.defaultTab()}
        onChange={viewState.applyTabPreset}
      />
    );

  return (
    <div class="flex w-full shrink-0 flex-col">
      <SplitHeaderLeft>
        <div class="flex h-full min-w-0 items-center gap-3">
          <Show when={!isMobile() && !viewState.searchOpen()}>
            <div class="flex shrink-0 items-center gap-1">
              <span class="text-sm font-semibold">{viewState.viewName()}</span>
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
              !viewState.searchOpen() &&
              (view() === 'companies' || viewState.tabs().length > 0)
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
          <Show when={!viewState.searchOpen() && view() === 'mail'}>
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
            when={viewState.searchOpen()}
            fallback={
              <>
                <Show when={view() === 'companies'}>
                  <CompanyViewsMenu />
                  <CompanyDisplayMenu />
                </Show>
                <Show when={view() !== 'search'}>
                  <SoupViewCreateButton />
                </Show>
                <Show
                  when={view() === 'search'}
                  fallback={
                    <CollapsibleHeaderItem
                      id="search"
                      priority={0}
                      onCollapsedChange={setSearchCollapsed}
                      expanded={() => (
                        <SoupSearchInput class="h-7 w-60 rounded-lg border border-edge-muted bg-surface px-2 text-sm outline-none" />
                      )}
                      collapsed={() => (
                        <Tooltip label="Search" hotkey={TOKENS.soup.openSearch}>
                          <Button
                            variant="base"
                            size="icon-sm"
                            depth={2}
                            class="bg-surface"
                            label="Search"
                            onClick={() => viewState.openSearch()}
                          >
                            <SearchIcon />
                          </Button>
                        </Tooltip>
                      )}
                    />
                  }
                >
                  <div class="ml-2 min-w-0 grow [contain:inline-size]">
                    <SoupSearchInput class="h-7 w-full rounded-lg border border-edge-muted bg-surface px-2 text-sm outline-none" />
                  </div>
                </Show>
              </>
            }
          >
            <div class="ml-2 flex min-w-0 grow items-center gap-1">
              <SoupSearchInput
                class="h-7 min-w-0 flex-1 rounded-lg border border-edge-muted bg-surface px-2 text-sm outline-none"
                autofocus
              />
              <Button
                variant="ghost"
                size="icon-sm"
                label="Close search"
                onClick={() => viewState.setSearchOpen(false)}
              >
                <XIcon />
              </Button>
            </div>
          </Show>
        </SplitHeaderRight>

        <SplitToolbarLeft>
          <div class="flex min-w-0 flex-1 items-center gap-1">
            <Show when={view() === 'search'} fallback={<SoupFacetFilter />}>
              <SoupSearchFacets />
            </Show>
            <Show when={showSoupSort(view(), isNewInbox())}>
              <SortDropdown
                value={activeSort}
                onChange={(id) => collection.setSort([{ id, reversed: false }])}
                options={soupSortOptions(view())}
                open={viewState.sortOpen()}
                onOpenChange={viewState.setSortOpen}
              />
            </Show>
            <Show when={view() === 'inbox' && isNewInbox()}>
              <TabsInset
                list={INBOX_READ_TABS}
                value={readFilter(collection)}
                defaultValue="unread"
                onChange={(value) =>
                  setReadFilter(
                    collection,
                    value === 'read' || value === 'all' ? value : 'unread'
                  )
                }
              />
            </Show>
            <Show when={soupGroupOptions(view()).length > 0}>
              <GroupDropdown
                value={activeGroup}
                onChange={(id) => {
                  collection.setGroupBy(id === 'none' ? undefined : id);
                  collection.disclosure.expandAll();
                }}
                options={soupGroupOptions(view())}
                open={groupOpen()}
                onOpenChange={setGroupOpen}
              />
            </Show>
          </div>
        </SplitToolbarLeft>
        <SplitToolbarRight>
          <Tooltip
            hotkey={
              breakpoints.wide() ? TOKENS.unifiedList.togglePreview : undefined
            }
            label={breakpoints.wide() ? 'Preview' : 'No space for preview'}
          >
            <Button
              onClick={() => viewState.setPreviewOpen((open) => !open)}
              variant="base"
              size="sm"
              depth={2}
              class="bg-surface"
              disabled={!breakpoints.wide()}
            >
              {viewState.previewOpen() ? <EyeSlashIcon /> : <EyeIcon />}
              <span>Preview</span>
            </Button>
          </Tooltip>
        </SplitToolbarRight>
      </Show>

      <Show when={!isMobile() && view() !== 'search'}>
        <SoupActiveFacets />
      </Show>
    </div>
  );
}
