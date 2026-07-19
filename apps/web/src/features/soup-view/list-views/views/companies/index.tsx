import { List, useList } from '@app/components/list';
import { SoupChatInput } from '@app/features/chat/SoupChatInput';
import { CompanyListEntity } from '@app/features/next-soup/soup-view/views/companies/CompanyListEntity';
import {
  openEntityInNewTab,
  openEntityInSplitFromUnifiedList,
} from '@app/features/next-soup/utils';
import {
  SoupCollectionProvider,
  type SoupItem,
  useSoupCollection,
} from '@app/features/soup-list';
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
import Spinner from '@phosphor/spinner.svg';
import {
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
import {
  SoupCompaniesErrorState,
  SoupEmptyState,
} from '../../../components/soup-empty-state';
import { SoupEntityListItem } from '../../../components/soup-entity-list-item';
import { SoupFileDropzone } from '../../../components/soup-file-dropzone';
import { SoupMobileControls } from '../../../components/soup-mobile-controls';
import { SoupPreviewPane } from '../../../components/soup-preview-pane';
import { SoupSelectionToolbar } from '../../../components/soup-selection-toolbar';
import { SoupViewHeader } from '../../../components/soup-view-header';
import { SoupViewProvider, useSoupView } from '../../../context';
import { useSoupNotificationInvalidators } from '../../../use-soup-notification-invalidators';
import { SoupEntityList } from '../../soup-entity-list';
import { SoupViewRoot } from '../../soup-view-root';
import { useSoupViewSetup } from '../../use-soup-view-setup';
import { CompanyKanban } from './company-kanban';
import {
  type InitialSoupCompanyView,
  resolveInitialCompanyView,
} from './company-view-config';
import { useCompanyBoardPreviewRestoration } from './use-company-board-preview-restoration';

export type CompaniesListViewProps = {
  viewName?: string;
  initialCrmView?: InitialSoupCompanyView;
};

function CompaniesListViewContent(props: {
  initialCrmView?: InitialSoupCompanyView;
}) {
  const collection = useSoupCollection();
  const { dataSource, state: listState } = useList<SoupItem>();
  const panel = useSplitPanelOrThrow();
  const view = useSoupView();
  const crmUnavailable = useCrmUnavailable();
  const boardActive = () => view.viewMode() === 'board';
  const previewId = panel.handle.currentEntryState()?.['soup.preview'];
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const [listContent, setListContent] = createSignal<HTMLDivElement>();
  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  const [attachHotkeys, listScopeId] = useHotkeyDOMScope('soup-view');

  useCompanyBoardPreviewRestoration({
    enabled: boardActive,
    persistedEntityId: typeof previewId === 'string' ? previewId : undefined,
    previewEntity: view.previewEntity,
    setPreviewEntity: view.setPreviewEntity,
  });
  useSplitDisplayName(view.viewName);
  useSoupNotificationInvalidators();
  onMount(() => root()?.focus());
  createEffect(() => {
    const visible = view.previewPaneVisible();
    const [current, setCurrent] = panel.previewState;
    if (current() !== visible) setCurrent(visible);
  });
  onCleanup(() => panel.previewState[1](false));

  const selectedEntities = createMemo(() =>
    listState.selection
      .selected()
      .flatMap((item) => (item.kind === 'entity' ? [item.entity] : []))
  );

  return (
    <SplitPanelContext.Provider
      value={{
        ...panel,
        halfSplitState: () =>
          view.previewVisible() ? { side: 'left', percentage: 30 } : undefined,
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
                id="soup-list"
                minSize={300}
                maxSize={view.previewPaneVisible() ? 440 : undefined}
              >
                <div
                  ref={setListContent}
                  class="relative flex size-full min-h-0 min-w-0 flex-col"
                >
                  <List.Content>
                    <Show when={!boardActive()}>
                      <List.Items>
                        <SoupEntityList
                          view="companies"
                          root={root}
                          listScopeId={listScopeId}
                          viewportRef={setViewport}
                          active={() => !boardActive()}
                          restoreCollection={!props.initialCrmView}
                        >
                          {(item) => (
                            <SoupEntityListItem item={item}>
                              {(row) => <CompanyListEntity {...row} />}
                            </SoupEntityListItem>
                          )}
                        </SoupEntityList>
                      </List.Items>
                      <List.Error>
                        {() => (
                          <div class="size-full min-h-0">
                            <SoupCompaniesErrorState />
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
                        onClear={() => {
                          listState.selection.clear();
                          root()?.focus();
                        }}
                      />
                    </Show>
                  </Show>

                  <Show when={boardActive()}>
                    <Switch>
                      <Match when={dataSource.error()}>
                        <SoupCompaniesErrorState />
                      </Match>
                      <Match when={crmUnavailable()}>
                        <SoupEmptyState />
                      </Match>
                      <Match when={dataSource.isLoading()}>
                        <div class="flex size-full items-center justify-center">
                          <Spinner class="size-4 animate-spin" />
                        </div>
                      </Match>
                      <Match when={collection.browseEntities().length === 0}>
                        <SoupEmptyState />
                      </Match>
                      <Match when={true}>
                        <CompanyKanban
                          onEntityClick={(entity, event) => {
                            listState.navigate.toId(entity.id, {
                              reason: 'pointer',
                            });
                            if (view.previewPaneVisible()) {
                              view.setPreviewEntity(entity);
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
              <SoupPreviewPane root={root} />
            </Resize.Zone>
          </div>
        </SoupViewRoot>
      </SoupFileDropzone>

      <Suspense>
        <Show
          when={ENABLE_UNIFIED_LIST_AI_INPUT && !isMobile() && !boardActive()}
        >
          <SoupChatInput />
        </Show>
      </Suspense>
    </SplitPanelContext.Provider>
  );
}

export function CompaniesListView(props: CompaniesListViewProps) {
  const initialView = props.initialCrmView
    ? resolveInitialCompanyView(props.initialCrmView)
    : undefined;
  const setup = useSoupViewSetup({
    view: 'companies',
    initialState: initialView?.initialState,
  });

  return (
    <SoupCollectionProvider value={setup.collection}>
      <List.Root
        dataSource={setup.collection.dataSource}
        state={setup.listState}
      >
        <SoupViewProvider
          view="companies"
          viewName={props.viewName ?? 'Companies'}
          initialViewMode={initialView?.viewMode}
        >
          <CompaniesListViewContent initialCrmView={props.initialCrmView} />
        </SoupViewProvider>
      </List.Root>
    </SoupCollectionProvider>
  );
}
