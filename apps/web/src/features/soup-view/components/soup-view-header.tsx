import { LIST_VIEW_DOCS_URL } from '@app/constants/docs-links';
import type { ListView } from '@app/constants/list-views';
import { GroupDropdown } from '@app/features/next-soup/soup-view/filters-bar/group-dropdown';
import { SortDropdown } from '@app/features/next-soup/soup-view/filters-bar/sort-dropdown';
import {
  COMPANY_GROUP_OPTIONS,
  type GroupOption,
  type GroupOptionId,
  TASK_GROUP_OPTIONS,
} from '@app/features/next-soup/soup-view/group-options';
import {
  CHANNEL_SORT_OPTIONS,
  DEFAULT_SORT_OPTIONS,
  DOCUMENT_SORT_OPTIONS,
  EMAIL_SORT_OPTIONS,
  type SortOption,
  type SystemSortOption,
  TASK_SORT_OPTIONS,
} from '@app/features/next-soup/soup-view/sort-options';
import { SoupViewCreateButton } from '@app/features/next-soup/soup-view/soup-view-create-button';
import { useSoupCollection } from '@app/features/soup-list';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@components/app/split-layout/components/SplitHeader';
import {
  SplitToolbarLeft,
  SplitToolbarRight,
} from '@components/app/split-layout/components/SplitToolbar';
import { createSplitBreakpoints } from '@components/app/split-layout/create-split-breakpoints';
import { TabsInset } from '@core/component/TabsInset';
import { TOKENS } from '@core/hotkey/tokens';
import { isMobile } from '@core/mobile/isMobile';
import { openExternalUrl } from '@core/util/url';
import InfoIcon from '@phosphor/info.svg';
import EyeIcon from '@phosphor-icons/core/regular/eye.svg?component-solid';
import EyeSlashIcon from '@phosphor-icons/core/regular/eye-slash.svg?component-solid';
import { Button, Tooltip } from '@ui';
import { createSignal, Show } from 'solid-js';
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

const sortOptions = (view: ListView): SortOption[] => {
  if (view === 'tasks') return TASK_SORT_OPTIONS;
  if (view === 'mail') return EMAIL_SORT_OPTIONS;
  if (view === 'documents') return DOCUMENT_SORT_OPTIONS;
  if (view === 'channels') return CHANNEL_SORT_OPTIONS;
  return DEFAULT_SORT_OPTIONS;
};

const groupOptions = (view: ListView): GroupOption[] => {
  if (view === 'tasks') return TASK_GROUP_OPTIONS;
  if (view === 'companies') return COMPANY_GROUP_OPTIONS;
  return [];
};

export function SoupViewHeader() {
  const collection = useSoupCollection();
  const viewState = useSoupView();
  const breakpoints = createSplitBreakpoints({ wide: 640 });
  const view = viewState.view;
  const isNewInbox = useIsNewInbox();
  const [groupOpen, setGroupOpen] = createSignal(false);
  const docsUrl = () => LIST_VIEW_DOCS_URL[view()];
  const activeSort = () =>
    (collection.sort()[0]?.id as SystemSortOption | undefined) ?? 'updated_at';
  const activeGroup = () =>
    (collection.groupBy() as GroupOptionId | undefined) ?? 'none';

  return (
    <div class="flex w-full shrink-0 flex-col">
      <SplitHeaderLeft>
        <div class="flex h-full items-center gap-3">
          <Show when={!isMobile()}>
            <div class="flex items-center gap-1">
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
            when={view() === 'companies'}
            fallback={
              <Show when={viewState.tabs().length > 0}>
                <TabsInset
                  list={viewState.tabs()}
                  value={collection.activeTab()}
                  defaultValue={viewState.defaultTab()}
                  onChange={viewState.applyTabPreset}
                />
              </Show>
            }
          >
            <TabsInset
              list={COMPANY_MODE_TABS}
              value={viewState.viewMode()}
              defaultValue="board"
              onChange={(value) =>
                viewState.setViewMode(value === 'list' ? 'list' : 'board')
              }
            />
          </Show>
          <Show when={view() === 'mail'}>
            <SoupInboxSelector />
          </Show>
        </div>
      </SplitHeaderLeft>

      <Show when={!isMobile()}>
        <SplitHeaderRight>
          <Show when={view() === 'companies'}>
            <CompanyViewsMenu />
            <CompanyDisplayMenu />
          </Show>
          <Show when={view() !== 'search'}>
            <SoupViewCreateButton />
          </Show>
          <input
            ref={viewState.setSearchInput}
            value={collection.search()}
            onInput={(event) => collection.setSearch(event.currentTarget.value)}
            class="h-7 w-36 rounded-lg border border-edge-muted bg-surface px-2 text-sm outline-none min-[1100px]:w-60"
            placeholder="Search, @mention contacts"
            aria-label="Search"
          />
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
                options={sortOptions(view())}
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
            <Show when={groupOptions(view()).length > 0}>
              <GroupDropdown
                value={activeGroup}
                onChange={(id) => {
                  collection.setGroupBy(id === 'none' ? undefined : id);
                  collection.disclosure.expandAll();
                }}
                options={groupOptions(view())}
                open={groupOpen()}
                onOpenChange={setGroupOpen}
              />
            </Show>
            <Show when={view() !== 'search'}>
              <SoupActiveFacets />
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
    </div>
  );
}
