import { List, useList } from '@app/components/list';
import { SoupChatInput } from '@app/features/chat/SoupChatInput';
import {
  getSoupRowEntities,
  type SoupCollection,
  type SoupRow,
} from '@app/features/soup/collection';
import {
  openEntityInNewTab,
  openEntityInSplitFromUnifiedList,
  preventDuplicatePreviewEntityOpen,
} from '@app/features/soup/utils';
import { useSoupView } from '@app/features/soup/view/context';
import { CompanyListEntity } from '@app/features/soup/view/views/companies/CompanyListEntity';
import { useCrmUnavailable } from '@companies/crm/team-crm-config';
import { PullToRefresh } from '@components/app/mobile/PullToRefresh';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useSplitDisplayName } from '@components/app/split-layout/use-split-display-name';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { ENABLE_UNIFIED_LIST_AI_INPUT } from '@core/constant/featureFlags';
import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { isMobile } from '@core/mobile/isMobile';
import Spinner from '@phosphor/spinner.svg';
import { useIsTeamAdmin } from '@queries/team/teams';
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  Match,
  onMount,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import {
  findEntityItem,
  getSelectedEntities,
} from '../../../actions/list-action-state';
import { SoupFileDropzone } from '../../components/actions/soup-file-dropzone';
import { SoupSelectionToolbar } from '../../components/actions/soup-selection-toolbar';
import { SoupMobileControls } from '../../components/mobile/soup-mobile-controls';
import {
  SoupCompaniesErrorState,
  SoupEmptyState,
} from '../../components/soup-empty-state';
import { SoupViewProvider } from '../../context';
import { createSoupList } from '../../primitives/create-soup-list';
import { hasSoupCollectionEntryState } from '../../primitives/soup-collection-persistence';
import { SoupEntityList } from '../../soup-entity-list';
import {
  SOUP_MARK_DONE_ROW_CONFIG,
  SoupEntityListItem,
} from '../../soup-entity-list-item';
import { SoupViewHeader } from '../../soup-view-header';
import { getViewPreset } from '../../soup-view-presets';
import { SoupViewRoot } from '../../soup-view-root';
import { CompanyKanban } from './company-kanban';
import {
  type InitialSoupCompanyView,
  isSoupCompanyViewConfig,
  resolveInitialCompanyView,
} from './company-view-config';
import { CrmDefaultViewLoader } from './crm-default-view';

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
    sortVisible,
    viewMode,
    viewName,
  } = useSoupView();
  const crmUnavailable = useCrmUnavailable();
  const boardActive = () => viewMode() === 'board';
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const [listContent, setListContent] = createSignal<HTMLDivElement>();
  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  const [attachHotkeys, listScopeId] = useHotkeyDOMScope('soup-view');

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
  onMount(() => root()?.focus());
  const selectedEntities = createMemo(() => getSelectedEntities(listState));
  const boardEntityCount = () => getSoupRowEntities(dataSource.items()).length;

  return (
    <>
      <SoupFileDropzone>
        <SoupViewRoot
          ref={(element) => {
            setRoot(element);
            attachHotkeys(element);
          }}
          listScopeId={listScopeId}
        >
          <SoupViewHeader sortVisible={sortVisible()} />
          <SoupMobileControls />
          <div
            ref={setListContent}
            class="relative flex grow min-h-0 min-w-0 flex-col"
          >
            <List.Content forceEmpty={crmUnavailable()}>
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
              <Show when={!boardActive()}>
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
                  dataSource.items().length > 0 ? viewport() : listContent()
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
                <Match when={dataSource.error() && boardEntityCount() === 0}>
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
                      if (
                        !event.shiftKey &&
                        !event.altKey &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        panel.handle.isControllerSplit() &&
                        preventDuplicatePreviewEntityOpen(entity, panel.handle)
                      ) {
                        return;
                      }

                      const item = findEntityItem(listState, entity.id);
                      if (item) {
                        listState.navigate.toId(item.id, {
                          reason: 'pointer',
                          force: true,
                        });
                      }
                      if (event.metaKey || event.ctrlKey) {
                        openEntityInNewTab({ entity });
                        return;
                      }
                      void openEntityInSplitFromUnifiedList(entity, {
                        splitHandle: panel.handle,
                        referredFrom: 'companies',
                        openInNewSplit: event.shiftKey,
                        replacePreview: !event.shiftKey && event.altKey,
                      });
                    }}
                  />
                </Match>
              </Switch>
            </Show>
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
    </>
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
