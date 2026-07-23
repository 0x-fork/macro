import { List, type ListActivation, useList } from '@app/components/list';
import type { ListView } from '@app/constants/list-views';
import {
  navigateChannelEntityToTarget,
  openEntityInNewTab,
  openEntityInSplitFromUnifiedList,
} from '@app/features/next-soup/utils';
import {
  isSoupRowVisible,
  type SoupEntityRow,
  type SoupRow,
  useSoupCollection,
} from '@app/features/soup-list';
import {
  useGlobalBlockOrchestrator,
  useGlobalNotificationSource,
} from '@components/app/GlobalAppState';
import { SwipableRowProvider } from '@components/app/mobile/SwipableRow';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { useUserId } from '@core/context/user';
import {
  type EntityData,
  isNonMemberChannelEntity,
  isSearchEntity,
  ListEntityMetadataQueryProvider,
  ListLayoutProvider,
  type ProjectEntity,
  type SearchLocation,
} from '@entity';
import CaretDownIcon from '@phosphor/caret-down.svg';
import Spinner from '@phosphor/spinner.svg';
import { Button } from '@ui';
import {
  type Accessor,
  createEffect,
  createSignal,
  type JSX,
  Match,
  on,
  type Setter,
  Show,
  Switch,
} from 'solid-js';
import type { VirtualizerHandle } from 'virtua/solid';
import type { CacheSnapshot } from 'virtua/unstable_core';
import {
  canExecuteMarkDoneOnView,
  makeMarkDoneAction,
} from '../actions/make-mark-done-action';
import { SoupGroupHeader } from '../components/soup-group-header';
import { SoupListHeader } from '../components/soup-list-headers';
import { SoupMobileActionDrawerManager } from '../components/soup-mobile-action-drawer';
import { useSoupView } from '../context';
import { useSoupViewEntryState } from '../use-soup-view-entry-state';
import { useSoupViewHotkeys } from '../use-soup-view-hotkeys';
import { useIsNewInbox } from '../utils';

const DEFAULT_OVERSCAN = 5;

type SoupActivationMetadata = {
  event?: MouseEvent | PointerEvent;
  location?: SearchLocation;
  project?: ProjectEntity;
  navigateChannelTarget?: boolean;
  openInNewSplit?: boolean;
};

const entityFromRow = (row: SoupRow | undefined): EntityData | undefined => {
  if (row?.kind !== 'entity') return;
  return row.entity;
};

type SoupEntityListProps = {
  view: ListView;
  root: Accessor<HTMLDivElement | undefined>;
  listScopeId: string;
  viewportRef?: Setter<HTMLDivElement | undefined>;
  children: (row: Accessor<SoupEntityRow>) => JSX.Element;
  trailing?: JSX.Element;
  active?: Accessor<boolean>;
  autoFocusFirstEntity?: boolean | Accessor<boolean>;

  itemSize?: number;
  overscan?: number;
  cache?: CacheSnapshot;
  initialScrollOffset?: number;
  nearEndOffset?: number;
  scopeId?: string;
  onActivate?: (activation: ListActivation<SoupRow>) => void;
  onNavigate?: (row: SoupRow, index: number) => void;
  canNavigate?: () => boolean;
  onLoadMoreError?: (error: unknown) => void;
};

export function SoupEntityList(props: SoupEntityListProps) {
  const panel = useSplitPanelOrThrow();
  const orchestrator = useGlobalBlockOrchestrator();
  const collection = useSoupCollection();
  const view = useSoupView();
  const { dataSource, state: listState } = useList<SoupRow>();
  const userId = useUserId();
  const notificationSource = useGlobalNotificationSource();
  const markDone = makeMarkDoneAction({
    userId,
    notificationSource: () => notificationSource,
    isNewInbox: useIsNewInbox(),
  });
  const active = () => props.active?.() ?? true;
  const isVisible = (row: SoupRow) =>
    isSoupRowVisible(row, collection.collapsedGroups.isExpanded);
  const autoFocusFirstEntity = () =>
    typeof props.autoFocusFirstEntity === 'function'
      ? props.autoFocusFirstEntity()
      : (props.autoFocusFirstEntity ?? true);

  const activateRow = (activation: ListActivation<SoupRow>) => {
    if (
      activation.item.kind === 'entity' &&
      isNonMemberChannelEntity(activation.item.entity)
    ) {
      return;
    }

    props.onActivate?.(activation);
    if (activation.item.kind !== 'entity') return;

    const metadata = (activation.metadata ?? {}) as SoupActivationMetadata;
    const entity = metadata.project ?? activation.item.entity;

    if (metadata.navigateChannelTarget) {
      void navigateChannelEntityToTarget(entity, orchestrator);
      return;
    }

    let location = metadata.location;
    if (!location && isSearchEntity(entity)) {
      const hits = entity.search.contentHitData;
      if (hits?.length === 1) location = hits[0]?.location;
    }

    if (metadata.event?.metaKey || metadata.event?.ctrlKey) {
      openEntityInNewTab({ entity, location });
      return;
    }

    void openEntityInSplitFromUnifiedList(entity, {
      splitHandle: panel.handle,
      referredFrom: props.view,
      location,
      openInNewSplit:
        metadata.openInNewSplit ?? metadata.event?.shiftKey ?? false,
    });
  };

  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  const [virtualizer, setVirtualizer] = createSignal<VirtualizerHandle>();

  let focusHasResolved = false;
  createEffect(() => {
    if (!active()) return;
    const entity = entityFromRow(listState.focus.item());
    if (entity) {
      focusHasResolved = true;
      view.setPreviewEntity(entity);
    } else if (focusHasResolved || view.previewEntityId() === undefined) {
      view.setPreviewEntity(undefined);
    }
  });
  const { restoredListState, persistedPreviewEntity } = useSoupViewEntryState({
    virtualizer,
  });

  const { scrollTo } = useSoupViewHotkeys({
    listScopeId: props.scopeId ?? panel.splitHotkeyScope,
    scopeId: props.scopeId,
    root: props.root,
    virtualizer,
    activate: activateRow,
    enabled: active,
    canNavigate: () => props.canNavigate?.() ?? true,
    onNavigate: props.onNavigate,
  });

  const focusFirstEntity = () => {
    if (!active() || !autoFocusFirstEntity() || listState.items.count() === 0)
      return;
    const firstEntity = listState.items
      .all()
      .find((row) => listState.selection.isSelectable(row));
    if (!firstEntity) return;
    const result = listState.navigate.toId(firstEntity.id, {
      reason: 'programmatic',
    });
    if (result) scrollTo(result.index);
  };

  const restoreFocus = (rowId: string | undefined) => {
    if (rowId !== undefined) {
      const restored = listState.focus.set(rowId, {
        reason: 'restore',
        force: true,
      });
      if (restored) return restored;
    }

    return listState.focus.restore(undefined, {
      reason: 'restore',
      fallback: 'nearest',
    });
  };

  let initialFocusApplied = false;
  createEffect(
    on(
      [() => listState.items.all(), active, () => dataSource.isLoading()],
      () => {
        if (
          !active() ||
          initialFocusApplied ||
          listState.items.count() === 0 ||
          dataSource.isLoading()
        ) {
          return;
        }

        initialFocusApplied = true;
        if (restoredListState?.focus) {
          const restored = restoreFocus(restoredListState.focus);
          if (restored) scrollTo(restored.index);
          return;
        }
        if (persistedPreviewEntity) {
          const previewRow = listState.items
            .all()
            .find(
              (row) =>
                row.kind === 'entity' &&
                row.entity.id === persistedPreviewEntity
            );
          const restored = restoreFocus(previewRow?.id);
          if (restored) scrollTo(restored.index);
          return;
        }
        focusFirstEntity();
      }
    )
  );

  const [focusResetPending, setFocusResetPending] = createSignal(false);
  createEffect(
    on(
      [
        () => collection.state.activeTab,
        () => collection.state.search,
        () => collection.state.groupBy,
        () => collection.facets.serialize(),
      ],
      () => {
        listState.focus.clear({ reason: 'items' });
        setFocusResetPending(true);
      },
      { defer: true }
    )
  );
  createEffect(
    on(
      [
        focusResetPending,
        () => listState.items.all(),
        () => dataSource.isLoading(),
        () => dataSource.isFetching(),
      ],
      () => {
        if (!focusResetPending()) return;
        if (dataSource.isLoading() || dataSource.isFetching()) return;

        setFocusResetPending(false);
        focusFirstEntity();
      }
    )
  );

  const swipeEntity = (id: string) =>
    listState.items
      .all()
      .find(
        (item) =>
          item.kind === 'entity' && (item.id === id || item.entity.id === id)
      );
  const canMarkDone = (id: string) => {
    const item = swipeEntity(id);
    return (
      item?.kind === 'entity' &&
      canExecuteMarkDoneOnView(props.view, collection.state.activeTab ?? '') &&
      markDone.canExecute(item.entity)
    );
  };
  const executeMarkDone = (id: string) => {
    const item = swipeEntity(id);
    if (item?.kind !== 'entity') return;
    void markDone.executeWithList([item.entity], listState, undefined, {
      collapseEntity: view.collapseEntity.shouldCollapse()
        ? view.collapseEntity.callback()
        : undefined,
    });
  };

  return (
    <Show when={active()}>
      <ListEntityMetadataQueryProvider>
        <SoupMobileActionDrawerManager>
          <ListLayoutProvider ref={viewport}>
            <SwipableRowProvider
              container={viewport}
              canSwipeLeft={canMarkDone}
              onSwipeLeft={executeMarkDone}
              setCollapseEntity={view.collapseEntity.set}
            >
              <div class="@container/u-list unified-list-root no-select-children relative flex size-full min-h-0 min-w-0 flex-col">
                <SoupListHeader />
                <StaticMarkdownContext>
                  <List.Viewport
                    ref={(element) => {
                      setViewport(element);
                      props.viewportRef?.(element);
                    }}
                    class="scrollbar-hidden pb-15 mobile:pb-(--mobile-content-inset-bottom)"
                    nearEndOffset={props.nearEndOffset ?? 300}
                    onNearEndError={props.onLoadMoreError}
                  >
                    <List.Virtual<SoupRow>
                      itemSize={props.itemSize}
                      overscan={props.overscan ?? DEFAULT_OVERSCAN}
                      cache={props.cache ?? restoredListState?.virtualCache}
                      initialScrollOffset={
                        props.initialScrollOffset ??
                        restoredListState?.scrollOffset
                      }
                      virtualizerRef={setVirtualizer}
                    >
                      {(item, index) => (
                        <>
                          <Switch>
                            <Match
                              when={
                                item.kind === 'group-header' ? item : undefined
                              }
                            >
                              {(header) => (
                                <List.Item item={header()}>
                                  {(state) => (
                                    <SoupGroupHeader
                                      item={header()}
                                      focused={state.focused()}
                                    />
                                  )}
                                </List.Item>
                              )}
                            </Match>
                            <Match
                              when={
                                item.kind === 'section-header'
                                  ? item
                                  : undefined
                              }
                            >
                              {(section) => (
                                <List.Item item={section()}>
                                  {() => (
                                    <div class="flex h-8 items-end px-3 pb-1 text-xs font-semibold text-ink-extra-muted">
                                      {section().label}
                                    </div>
                                  )}
                                </List.Item>
                              )}
                            </Match>
                            <Match
                              when={
                                item.kind === 'load-more' && isVisible(item)
                                  ? item
                                  : undefined
                              }
                            >
                              {(loadMore) => (
                                <List.Item item={loadMore()}>
                                  {(state) => (
                                    <div
                                      class="my-1 flex min-h-9 items-center justify-center"
                                      classList={{
                                        'mx-1 rounded bg-active/60':
                                          state.focused(),
                                      }}
                                    >
                                      <Button
                                        variant="base"
                                        size="sm"
                                        depth={2}
                                        disabled={loadMore().isLoading?.()}
                                        onClick={() =>
                                          void loadMore().loadMore()
                                        }
                                      >
                                        <Show
                                          when={loadMore().isLoading?.()}
                                          fallback={
                                            <CaretDownIcon class="size-2.5" />
                                          }
                                        >
                                          <Spinner class="size-3 animate-spin" />
                                        </Show>
                                        {loadMore().label ?? 'Load More'}
                                      </Button>
                                    </div>
                                  )}
                                </List.Item>
                              )}
                            </Match>
                            <Match
                              when={
                                item.kind === 'entity' && isVisible(item)
                                  ? item
                                  : undefined
                              }
                            >
                              {(entity) => <>{props.children(entity)}</>}
                            </Match>
                          </Switch>
                          <Show
                            when={index() === dataSource.items().length - 1}
                          >
                            {props.trailing}
                          </Show>
                        </>
                      )}
                    </List.Virtual>
                  </List.Viewport>
                </StaticMarkdownContext>
              </div>
            </SwipableRowProvider>
          </ListLayoutProvider>
        </SoupMobileActionDrawerManager>
      </ListEntityMetadataQueryProvider>
    </Show>
  );
}
