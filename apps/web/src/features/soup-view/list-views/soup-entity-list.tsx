import { List, type ListActivation, useList } from '@app/components/list';
import type { ListView } from '@app/constants/list-views';
import {
  navigateChannelEntityToTarget,
  openEntityInNewTab,
  openEntityInSplitFromUnifiedList,
} from '@app/features/next-soup/utils';
import {
  type SoupEntityItem,
  type SoupItem,
  useSoupCollection,
} from '@app/features/soup-list';
import { useGlobalBlockOrchestrator } from '@components/app/GlobalAppState';
import { SwipableRowProvider } from '@components/app/mobile/SwipableRow';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import {
  type EntityData,
  isSearchEntity,
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
import { useSoupEntityActions } from '../actions/use-soup-entity-actions';
import { SoupGroupHeader } from '../components/soup-group-header';
import { SoupListHeader } from '../components/soup-list-headers';
import { useSoupView } from '../context';
import { useSoupViewEntryState } from '../use-soup-view-entry-state';
import { useSoupViewHotkeys } from '../use-soup-view-hotkeys';

const DEFAULT_ITEM_SIZE = 10;
const DEFAULT_OVERSCAN = 5;

type SoupActivationMetadata = {
  event?: MouseEvent | PointerEvent;
  location?: SearchLocation;
  project?: ProjectEntity;
  navigateChannelTarget?: boolean;
  openInNewSplit?: boolean;
};

const entityFromItem = (item: SoupItem | undefined): EntityData | undefined =>
  item?.kind === 'entity' ? item.entity : undefined;

type SoupEntityListProps = {
  view: ListView;
  root: Accessor<HTMLDivElement | undefined>;
  listScopeId: string;
  viewportRef?: Setter<HTMLDivElement | undefined>;
  children: (item: Accessor<SoupEntityItem>) => JSX.Element;
  active?: Accessor<boolean>;
  autoFocusFirstEntity?: boolean | Accessor<boolean>;
  restoreCollection?: boolean;

  itemSize?: number;
  overscan?: number;
  cache?: CacheSnapshot;
  initialScrollOffset?: number;
  nearEndOffset?: number;
  scopeId?: string;
  onActivate?: (activation: ListActivation<SoupItem>) => void;
  onNavigate?: (item: SoupItem, index: number) => void;
  canNavigate?: () => boolean;
  onLoadMoreError?: (error: unknown) => void;
};

export function SoupEntityList(props: SoupEntityListProps) {
  const panel = useSplitPanelOrThrow();
  const orchestrator = useGlobalBlockOrchestrator();
  const collection = useSoupCollection();
  const view = useSoupView();
  const { dataSource, state: listState } = useList<SoupItem>();
  const entityActions = useSoupEntityActions();
  const active = () => props.active?.() ?? true;
  const autoFocusFirstEntity = () =>
    typeof props.autoFocusFirstEntity === 'function'
      ? props.autoFocusFirstEntity()
      : (props.autoFocusFirstEntity ?? true);

  const activateItem = (activation: ListActivation<SoupItem>) => {
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

  createEffect(() => {
    if (active()) {
      view.setPreviewEntity(entityFromItem(listState.focus.item()));
    }
  });
  const { restoredListState, persistedPreviewEntity } = useSoupViewEntryState({
    virtualizer,
    restoreCollection: props.restoreCollection,
  });

  const { scrollTo } = useSoupViewHotkeys({
    listScopeId: props.listScopeId,
    scopeId: props.scopeId,
    root: props.root,
    virtualizer,
    activate: activateItem,
    enabled: active,
    canNavigate: () => props.canNavigate?.() ?? true,
    onNavigate: props.onNavigate,
  });

  const focusFirstEntity = () => {
    if (!active() || !autoFocusFirstEntity() || listState.items.count() === 0)
      return;
    const firstEntity = listState.items
      .all()
      .find((item) => item.kind === 'entity');
    if (!firstEntity) return;
    const result = listState.navigate.toId(firstEntity.id, {
      reason: 'programmatic',
    });
    if (result) scrollTo(result.index);
  };

  let initialFocusApplied = false;
  createEffect(() => {
    const count = listState.items.count();
    if (
      !active() ||
      initialFocusApplied ||
      count === 0 ||
      dataSource.isLoading()
    )
      return;
    initialFocusApplied = true;
    queueMicrotask(() => {
      if (restoredListState?.focus) {
        const restored = listState.focus.restore(restoredListState.focus, {
          reason: 'restore',
          fallback: 'nearest',
        });
        if (restored) scrollTo(restored.index);
        return;
      }
      if (persistedPreviewEntity) {
        const restored = listState.focus.restore(persistedPreviewEntity, {
          reason: 'restore',
          fallback: 'nearest',
        });
        if (restored) scrollTo(restored.index);
        return;
      }
      focusFirstEntity();
    });
  });

  createEffect(
    on(
      [
        collection.search,
        collection.groupBy,
        () => collection.facets.serialize(),
      ],
      () => queueMicrotask(focusFirstEntity),
      { defer: true }
    )
  );

  return (
    <Show when={active()}>
      <ListLayoutProvider ref={viewport}>
        <SwipableRowProvider
          container={viewport}
          triggerBehavior="spring-back"
          canSwipeRight={(id) => {
            const item = listState.items.get(id);
            return (
              item?.kind === 'entity' &&
              entityActions
                .build([item.entity])
                .some(
                  (action) =>
                    action.id === 'mark-done' || action.id === 'favorite'
                )
            );
          }}
          canSwipeLeft={(id) => {
            const item = listState.items.get(id);
            return (
              item?.kind === 'entity' &&
              entityActions
                .build([item.entity])
                .some((action) => action.id === 'delete')
            );
          }}
        >
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
              <List.Items>
                <List.Virtual<SoupItem>
                  itemSize={props.itemSize ?? DEFAULT_ITEM_SIZE}
                  overscan={props.overscan ?? DEFAULT_OVERSCAN}
                  cache={props.cache ?? restoredListState?.virtualCache}
                  initialScrollOffset={
                    props.initialScrollOffset ?? restoredListState?.scrollOffset
                  }
                  virtualizerRef={setVirtualizer}
                >
                  {(item) => (
                    <Switch>
                      <Match
                        when={item.kind === 'group-header' ? item : undefined}
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
                        when={item.kind === 'section-header' ? item : undefined}
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
                        when={item.kind === 'load-more' ? item : undefined}
                      >
                        {(loadMore) => (
                          <List.Item item={loadMore()}>
                            {(state) => (
                              <div
                                class="my-1 flex min-h-9 items-center justify-center"
                                classList={{
                                  'mx-1 rounded bg-active/60': state.focused(),
                                }}
                              >
                                <Button
                                  variant="base"
                                  size="sm"
                                  depth={2}
                                  disabled={loadMore().isLoading?.()}
                                  onClick={() => void loadMore().loadMore()}
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
                      <Match when={item.kind === 'entity' ? item : undefined}>
                        {(entity) => props.children(entity)}
                      </Match>
                    </Switch>
                  )}
                </List.Virtual>
              </List.Items>
            </List.Viewport>
          </StaticMarkdownContext>
        </SwipableRowProvider>
      </ListLayoutProvider>
    </Show>
  );
}
