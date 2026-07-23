import { List, useList } from '@app/components/list';
import { SoupChatInput } from '@app/features/chat/SoupChatInput';
import { CompanyListEntity } from '@app/features/next-soup/soup-view/views/companies/CompanyListEntity';
import {
  openEntityInNewTab,
  openEntityInSplitFromUnifiedList,
} from '@app/features/next-soup/utils';
import {
  getSoupRowEntities,
  type SoupCollection,
  type SoupRow,
} from '@app/features/soup-list';
import { useSoupView } from '@app/features/soup-view/context';
import { useCrmUnavailable } from '@companies/crm/team-crm-config';
import { PullToRefresh } from '@components/app/mobile/PullToRefresh';
import { SplitPanelContext } from '@components/app/split-layout/context';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useSplitDisplayName } from '@components/app/split-layout/use-split-display-name';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { Resize } from '@core/component/Resize';
import { ENABLE_UNIFIED_LIST_AI_INPUT } from '@core/constant/featureFlags';
import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { isMobile } from '@core/mobile/isMobile';
import EmptyStatePreviewIcon from '@design/empty-state-doc.svg';
import Spinner from '@phosphor/spinner.svg';
import { useIsTeamAdmin } from '@queries/team/teams';
import { EmptyStatePanel } from '@ui';
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  Match,
  onCleanup,
  onMount,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import { findEntityItem } from '../../../actions/list-action-state';
import {
  SoupCompaniesErrorState,
  SoupEmptyState,
} from '../../../components/soup-empty-state';
import {
  SOUP_MARK_DONE_ROW_CONFIG,
  SoupEntityListItem,
} from '../../../components/soup-entity-list-item';
import { SoupFileDropzone } from '../../../components/soup-file-dropzone';
import { SoupMobileControls } from '../../../components/soup-mobile-controls';
import { SoupPreviewPane } from '../../../components/soup-preview-pane';
import { SoupSelectionToolbar } from '../../../components/soup-selection-toolbar';
import { SoupViewHeader } from '../../../components/soup-view-header';
import { SoupViewProvider } from '../../../context';
import { hasSoupCollectionEntryState } from '../../../soup-collection-persistence';
import { getViewPreset } from '../../../soup-view-presets';
import { useSoupNotificationInvalidators } from '../../../use-soup-notification-invalidators';
import { createSoupList } from '../../create-soup-list';
import { SoupEntityList } from '../../soup-entity-list';
import { SoupViewRoot } from '../../soup-view-root';
import { CompanyKanban } from './company-kanban';
import {
  type InitialSoupCompanyView,
  isSoupCompanyViewConfig,
  resolveInitialCompanyView,
} from './company-view-config';
import { CrmDefaultViewLoader } from './crm-default-view';
import { useCompanyBoardPreviewRestoration } from './use-company-board-preview-restoration';

export type CompaniesListViewProps = {
  viewName?: string;
  initialCrmView?: InitialSoupCompanyView;
};

function sanitizeRestoredCompanyState(
  collection: SoupCollection,
  isTeamAdmin: boolean
) {
  const context = {
    userId: undefined,
    isTeamAdmin,
    isNewInbox: false,
  };
  const activeTab = collection.state.activeTab;
  if (!activeTab || getViewPreset('companies', activeTab, context)) return;

  const fallback = getViewPreset('companies', undefined, context);
  const fallbackFacets = fallback?.initialFacets;
  const fallbackTab = fallbackFacets?.companies?.[0];
  if (!fallback || !fallbackFacets || !fallbackTab) return;

  batch(() => {
    collection.facets.hydrate({
      ...collection.facets.serialize(),
      ...fallbackFacets,
    });
    collection.setState({
      activeTab: fallbackTab,
      groupBy: fallback.groupBy,
      emailView: fallback.emailView,
    });
  });
}

function CompaniesListViewContent() {
  const { dataSource, state: listState } = useList<SoupRow>();
  const panel = useSplitPanelOrThrow();
  const {
    applyTabPreset,
    collection,
    defaultTab,
    isTabAvailable,
    previewEntity,
    previewEntityId,
    previewPaneVisible,
    previewVisible,
    setPreviewEntity,
    viewMode,
    viewName,
  } = useSoupView();
  const crmUnavailable = useCrmUnavailable();
  const boardActive = () => viewMode() === 'board';
  const companyPreviewPaneVisible = () =>
    !crmUnavailable() && previewPaneVisible();
  const companyPreviewVisible = () => !crmUnavailable() && previewVisible();
  const previewId = previewEntityId();
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const [listContent, setListContent] = createSignal<HTMLDivElement>();
  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  const [attachHotkeys, listScopeId] = useHotkeyDOMScope('soup-view');

  useCompanyBoardPreviewRestoration({
    enabled: boardActive,
    persistedEntityId: previewId,
    previewEntity: previewEntity,
    setPreviewEntity: setPreviewEntity,
  });

  createEffect(() => {
    const activeTab = collection.state.activeTab;
    const fallbackTab = defaultTab();
    if (!activeTab || !fallbackTab || isTabAvailable(activeTab)) {
      return;
    }

    batch(() => {
      // A restored Hidden entry can outlive the user's admin permission.
      // Clear both preset-owned facets before applying Active so an invalid
      // hidden scope cannot survive the fallback merge.
      collection.facets.set('scope', []);
      collection.facets.set('companies', []);
      collection.setState('activeTab', undefined);
      applyTabPreset(fallbackTab);
    });
  });

  useSplitDisplayName(viewName);
  useSoupNotificationInvalidators();
  onMount(() => root()?.focus());
  createEffect(() => {
    const visible = companyPreviewPaneVisible();
    const [current, setCurrent] = panel.previewState;
    if (current() !== visible) setCurrent(visible);
  });
  onCleanup(() => panel.previewState[1](false));

  const selectedEntities = createMemo(() =>
    listState.selection
      .selected()
      .flatMap((item) => (item.kind === 'entity' ? [item.entity] : []))
  );
  const boardEntityCount = () => getSoupRowEntities(dataSource.items()).length;

  return (
    <SplitPanelContext.Provider
      value={{
        ...panel,
        halfSplitState: () =>
          companyPreviewVisible()
            ? { side: 'left', percentage: 30 }
            : undefined,
      }}
    >
      <SoupFileDropzone>
        <SoupViewRoot
          ref={(element) => {
            setRoot(element);
            attachHotkeys(element);
          }}
          listScopeId={listScopeId}
        >
          <SoupViewHeader />
          <SoupMobileControls />
          <div class="relative grow min-h-0 min-w-0 flex max-sm:flex-col">
            <Resize.Zone direction="horizontal" gutter={0}>
              <Resize.Panel
                id={boardActive() ? 'company-kanban' : 'soup-list'}
                minSize={boardActive() ? 200 : 300}
                maxSize={
                  !boardActive() && companyPreviewPaneVisible()
                    ? 440
                    : undefined
                }
              >
                <div
                  ref={setListContent}
                  class="relative flex size-full min-h-0 min-w-0 flex-col"
                >
                  <List.Content forceEmpty={crmUnavailable()}>
                    <Show when={!boardActive()}>
                      <List.Items>
                        <SoupEntityList
                          view="companies"
                          root={root}
                          listScopeId={listScopeId}
                          viewportRef={setViewport}
                          active={() => !boardActive()}
                        >
                          {(item) => (
                            <SoupEntityListItem item={item}>
                              {(scope) => (
                                <CompanyListEntity
                                  entity={scope.item().entity}
                                  highlighted={scope.highlighted()}
                                  checked={scope.selected()}
                                  entityRowConfig={SOUP_MARK_DONE_ROW_CONFIG}
                                  onChecked={scope.onChecked}
                                  onClick={scope.onClick}
                                  onProjectClick={scope.onProjectClick}
                                  onContentHitClick={scope.onContentHitClick}
                                />
                              )}
                            </SoupEntityListItem>
                          )}
                        </SoupEntityList>
                      </List.Items>
                      <List.Error>
                        {() => (
                          <div class="size-full min-h-0">
                            <Show
                              when={crmUnavailable()}
                              fallback={
                                <SoupCompaniesErrorState
                                  onRetry={dataSource.refresh}
                                />
                              }
                            >
                              <SoupEmptyState />
                            </Show>
                          </div>
                        )}
                      </List.Error>
                      <List.Loading>
                        <div class="flex size-full items-center justify-center">
                          <Spinner class="size-4 animate-spin" />
                        </div>
                      </List.Loading>
                      <List.Empty>
                        <div class="size-full min-h-0">
                          <SoupEmptyState />
                        </div>
                      </List.Empty>
                    </Show>
                  </List.Content>

                  <Show when={!boardActive()}>
                    <CustomScrollbar scrollContainer={viewport} />
                    <PullToRefresh
                      scrollContainer={() =>
                        dataSource.items().length > 0
                          ? viewport()
                          : listContent()
                      }
                      onRefresh={dataSource.refresh}
                    />
                    <Show when={selectedEntities().length > 0}>
                      <SoupSelectionToolbar
                        selected={selectedEntities()}
                        onClose={listState.selection.clear}
                        onClear={() => {
                          listState.selection.clear();
                          root()?.focus();
                        }}
                      />
                    </Show>
                  </Show>

                  <Show when={boardActive()}>
                    <Switch>
                      <Match when={crmUnavailable()}>
                        <SoupEmptyState />
                      </Match>
                      <Match
                        when={dataSource.error() && boardEntityCount() === 0}
                      >
                        <SoupCompaniesErrorState onRetry={dataSource.refresh} />
                      </Match>
                      <Match when={dataSource.isLoading()}>
                        <div class="flex size-full items-center justify-center">
                          <Spinner class="size-4 animate-spin" />
                        </div>
                      </Match>
                      <Match when={boardEntityCount() === 0}>
                        <SoupEmptyState />
                      </Match>
                      <Match when={true}>
                        <CompanyKanban
                          onEntityClick={(entity, event) => {
                            const item = findEntityItem(listState, entity.id);
                            if (item) {
                              listState.navigate.toId(item.id, {
                                reason: 'pointer',
                                force: true,
                              });
                            }
                            if (companyPreviewPaneVisible()) {
                              setPreviewEntity(entity);
                              return;
                            }
                            if (event.metaKey || event.ctrlKey) {
                              openEntityInNewTab({ entity });
                              return;
                            }
                            void openEntityInSplitFromUnifiedList(entity, {
                              splitHandle: panel.handle,
                              referredFrom: 'companies',
                              openInNewSplit: event.shiftKey,
                            });
                          }}
                        />
                      </Match>
                    </Switch>
                  </Show>
                </div>
              </Resize.Panel>
              <Show when={!crmUnavailable()}>
                <SoupPreviewPane
                  root={root}
                  minSize={boardActive() ? 500 : 0}
                  empty={
                    boardActive() ? (
                      <EmptyStatePanel
                        graphic={EmptyStatePreviewIcon}
                        title="Nothing selected"
                        description="Select a card from the board to preview it here"
                        centered
                      />
                    ) : undefined
                  }
                />
              </Show>
            </Resize.Zone>
          </div>
        </SoupViewRoot>
      </SoupFileDropzone>

      <Suspense>
        <Show
          when={
            ENABLE_UNIFIED_LIST_AI_INPUT &&
            !isMobile() &&
            (!boardActive() || crmUnavailable())
          }
        >
          <SoupChatInput />
        </Show>
      </Suspense>
    </SplitPanelContext.Provider>
  );
}

export function CompaniesListView(props: CompaniesListViewProps) {
  const panel = useSplitPanelOrThrow();
  const isTeamAdmin = useIsTeamAdmin();
  const applyDefaultView =
    props.initialCrmView === undefined &&
    !hasSoupCollectionEntryState(panel.handle.currentEntryState());
  const initialCrmView = isSoupCompanyViewConfig(props.initialCrmView)
    ? props.initialCrmView
    : undefined;
  const initialView = initialCrmView
    ? resolveInitialCompanyView(initialCrmView, {
        allowedTab: (requested) =>
          requested === 'hidden' && !isTeamAdmin()
            ? 'active'
            : (requested ?? 'active'),
      })
    : undefined;
  const setup = createSoupList({
    view: 'companies',
    initialState: initialView?.initialState,
    restoreCollection: props.initialCrmView === undefined,
  });
  sanitizeRestoredCompanyState(setup.collection, isTeamAdmin());

  return (
    <List.Root state={setup.list}>
      <SoupViewProvider
        soup={setup}
        view="companies"
        viewName={props.viewName ?? 'Companies'}
        initialViewMode={initialView?.viewMode}
      >
        <Show when={applyDefaultView}>
          <CrmDefaultViewLoader />
        </Show>
        <CompaniesListViewContent />
      </SoupViewProvider>
    </List.Root>
  );
}
