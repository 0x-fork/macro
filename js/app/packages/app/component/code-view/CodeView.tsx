import { SoupSearchbar } from '@app/component/next-soup/soup-view/filters-bar/soup-view-search-bar';
import { Button } from '@app/component/next-soup/soup-view/filters-bar/button';
import { SortDropdown } from '@app/component/next-soup/soup-view/filters-bar/sort-dropdown';
import {
  DOCUMENT_SORT_OPTIONS,
  type SystemSortOption,
} from '@app/component/next-soup/soup-view/sort-options';
import {
  type SoupRow,
  SoupViewContext,
  type SoupViewContextValues,
} from '@app/component/next-soup/soup-view/soup-view-context';
import { SoupViewList } from '@app/component/next-soup/soup-view/soup-view';
import type { SoupState } from '@app/component/next-soup/create-soup-state';
import { useSoup } from '@app/component/next-soup/soup-context';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { SplitPanelContext } from '@app/component/split-layout/context';
import type { SoupBody } from '@queries/soup/items';
import { useGithubPullRequestsQuery } from '@queries/github/pull-requests';
import { matchesGithubPullRequestSearch } from '@queries/github/transforms';
import type { PrEntity } from '@entity';
import { LabelAndHotKey, Tooltip } from '@core/component/Tooltip';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { AnimatedPreviewIcon } from '@macro-icons/wide/animating/preview';
import {
  createMemo,
  createRenderEffect,
  createSignal,
  type FlowComponent,
  onMount,
} from 'solid-js';

const attachRowMethods = (entity: PrEntity, soup: SoupState): SoupRow => {
  return {
    original: entity,
    id: entity.id,
    depth: 0,
    isFocused() {
      return soup.focus.id() === entity.id;
    },
    isSelected() {
      return soup.selection.isSelected(entity.id);
    },
    isGrouped() {
      return false;
    },
    isExpanded() {
      return soup.selection.isSelected(entity.id);
    },
    toggleExpanded() {
      return soup.selection.isSelected(entity.id);
    },
  };
};

const CodeViewContextProvider: FlowComponent<{ soup: SoupState }> = (props) => {
  const pullRequestsQuery = useGithubPullRequestsQuery();
  const [searchText, setSearchText] = createSignal('');
  const [queryFilters, setQueryFilters] = createSignal<SoupBody>({});
  const [assigneeFilter, setAssigneeFilter] = createSignal<string[]>([]);
  const [activeTab, setActiveTab] = createSignal<string | undefined>('all');

  const entities = createMemo(() => {
    const text = searchText();
    let next = pullRequestsQuery.data ?? [];

    if (text.trim().length > 0) {
      next = next.filter((pullRequest) =>
        matchesGithubPullRequestSearch(pullRequest, text)
      );
    }

    next = next.filter((entity) => props.soup.filters.test(entity));

    const sorts = props.soup.sort.active();
    if (sorts.length > 0) {
      next = [...next].sort((a, b) => {
        for (const sort of sorts) {
          const result = sort.fn(a, b);
          if (result !== 0) return result;
        }
        return 0;
      });
    }

    return next;
  });

  const rows = createMemo(() => {
    return entities().map((entity) => attachRowMethods(entity, props.soup));
  });

  createRenderEffect(() => {
    props.soup.setData(entities());
  });

  const context: SoupViewContextValues = {
    soup: props.soup,
    source: {
      data: entities,
      isLoading: () => pullRequestsQuery.isLoading,
      isFetching: () => pullRequestsQuery.isFetching,
      isFetchingNextPage: () => false,
      hasNextPage: () => false,
      fetchNextPage: () => {},
    },
    searchText,
    setSearchText,
    featuredIds: () => [],
    rows,
    isSearchServiceLoading: () => false,
    isLocalSearchSettling: () => false,
    queryFilters,
    setQueryFilters,
    assigneeFilter,
    setAssigneeFilter,
    activeTab,
    setActiveTab,
  };

  return (
    <SoupViewContext.Provider value={context}>
      {props.children}
    </SoupViewContext.Provider>
  );
};

const CodeToolbar = () => {
  const soup = useSoup();
  const [previewBtnHovering, setPreviewBtnHovering] = createSignal(false);

  const togglePreview = () => {
    const currentPreview = soup.previewEntity();
    if (currentPreview) {
      soup.setPreviewEntity(undefined);
      return;
    }

    const focused = soup.focus.id();
    if (!focused) return;
    soup.setPreviewEntity(focused);
  };

  registerHotkey({
    hotkey: 'space',
    scopeId: useSplitPanelOrThrow().splitHotkeyScope,
    hotkeyToken: TOKENS.unifiedList.togglePreview,
    description: 'Toggle preview',
    keyDownHandler: () => {
      togglePreview();
      return true;
    },
  });

  const sortValue = createMemo(
    () => (soup.sort.active()[0]?.id as SystemSortOption) ?? 'updated_at'
  );

  return (
    <div class="flex items-start gap-2 px-2 py-1.5 border-b border-edge-muted w-full">
      <div class="min-w-0 flex-1">
        <SoupSearchbar variant="secondary" />
      </div>
      <Tooltip tooltip={<LabelAndHotKey label="Preview" shortcut="space" />}>
        <Button
          variant={soup.previewEntity() ? 'primary' : 'ghost'}
          size="sm"
          class="rounded-xs [&_svg]:size-4 px-1 border border-transparent"
          onClick={togglePreview}
          onMouseEnter={() => setPreviewBtnHovering(true)}
          onMouseLeave={() => setPreviewBtnHovering(false)}
        >
          <AnimatedPreviewIcon triggerAnimation={previewBtnHovering()} />
        </Button>
      </Tooltip>
      <SortDropdown
        value={sortValue}
        onChange={(value) => soup.sort.setAll([value])}
        options={DOCUMENT_SORT_OPTIONS}
      />
    </div>
  );
};

export const CodeView = () => {
  const soup = useSoup();
  const panel = useSplitPanelOrThrow();

  onMount(() => {
    soup.filters.set({});
    soup.sort.setAll(['updated_at']);
  });

  return (
    <SplitPanelContext.Provider
      value={{
        ...panel,
        halfSplitState: () =>
          soup.previewEntity() ? { side: 'left', percentage: 30 } : undefined,
      }}
    >
      <CodeViewContextProvider soup={soup}>
        <div class="size-full flex flex-col">
          <div class="flex flex-col w-full">
            <SplitHeaderLeft>
              <h1 class="font-medium text-ink-muted select-none text-sm">Code</h1>
            </SplitHeaderLeft>
            <SplitHeaderRight />
            <CodeToolbar />
          </div>
          <div class="relative flex-grow min-h-1 flex flex-row size-full">
            <SoupViewList />
          </div>
        </div>
      </CodeViewContextProvider>
    </SplitPanelContext.Provider>
  );
};
