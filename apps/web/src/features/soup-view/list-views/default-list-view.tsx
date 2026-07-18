import { List, useList } from '@app/components/list';
import { SoupChatInput } from '@app/features/chat/SoupChatInput';
import { SoupCollectionProvider, type SoupItem } from '@app/features/soup-list';
import { usePullToRefresh } from '@components/app/mobile/use-pull-to-refresh';
import { SplitPanelContext } from '@components/app/split-layout/context';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useSplitDisplayName } from '@components/app/split-layout/use-split-display-name';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { Resize } from '@core/component/Resize';
import { ENABLE_UNIFIED_LIST_AI_INPUT } from '@core/constant/featureFlags';
import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { isMobile } from '@core/mobile/isMobile';
import { ListEntity } from '@entity';
import Spinner from '@phosphor/spinner.svg';
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from 'solid-js';
import { SoupEmptyState } from '../components/soup-empty-state';
import { SoupEntityListItem } from '../components/soup-entity-list-item';
import { SoupFileDropzone } from '../components/soup-file-dropzone';
import { SoupMobileControls } from '../components/soup-mobile-controls';
import { SoupPreviewPane } from '../components/soup-preview-pane';
import { SoupSelectionToolbar } from '../components/soup-selection-toolbar';
import { SoupViewHeader } from '../components/soup-view-header';
import { SoupViewProvider, useSoupView } from '../context';
import { useSoupNotificationInvalidators } from '../use-soup-notification-invalidators';
import { SoupEntityList } from './soup-entity-list';
import { SoupViewRoot } from './soup-view-root';
import { useSoupViewSetup } from './use-soup-view-setup';

export type DefaultListViewId =
  | 'agents'
  | 'calls'
  | 'channels'
  | 'folders'
  | 'mail';

export type DefaultListViewProps = {
  view: DefaultListViewId;
  viewName: string;
};

export function DefaultListView(props: DefaultListViewProps) {
  return <SoupViewImplementation {...props} />;
}

function useDefaultSoupViewSetup(props: DefaultListViewProps) {
  return useSoupViewSetup({ view: props.view });
}

/** Compatibility entry while concrete views migrate to their own provider roots. */
export function SoupViewImplementation(props: DefaultListViewProps) {
  const setup = useDefaultSoupViewSetup(props);
  return (
    <SoupCollectionProvider value={setup.collection}>
      <List.Root
        dataSource={setup.collection.dataSource}
        state={setup.listState}
      >
        <SoupViewProvider view={props.view} viewName={props.viewName}>
          <DefaultListViewContent />
        </SoupViewProvider>
      </List.Root>
    </SoupCollectionProvider>
  );
}

export function DefaultListViewContent() {
  const panel = useSplitPanelOrThrow();
  const view = useSoupView();
  const { dataSource, state: listState } = useList<SoupItem>();
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  const [attachHotkeys, listScopeId] = useHotkeyDOMScope('soup-view');

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

  usePullToRefresh({
    scrollContainer: viewport,
    onRefresh: dataSource.refresh,
    enabled: isMobile,
  });

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
                <div class="relative size-full min-h-0 min-w-0">
                  <List.Content>
                    <SoupEntityList
                      view={view.view()}
                      root={root}
                      listScopeId={listScopeId}
                      viewportRef={setViewport}
                    >
                      {(item) => (
                        <SoupEntityListItem item={item}>
                          {(row) => <ListEntity {...row} />}
                        </SoupEntityListItem>
                      )}
                    </SoupEntityList>
                    <List.Loading>
                      <Spinner class="size-4 animate-spin" />
                    </List.Loading>
                    <List.Empty>
                      <SoupEmptyState />
                    </List.Empty>
                  </List.Content>

                  <CustomScrollbar scrollContainer={viewport} />
                  <Show when={selectedEntities().length > 0}>
                    <SoupSelectionToolbar
                      selected={selectedEntities()}
                      onClear={() => {
                        listState.selection.clear();
                        root()?.focus();
                      }}
                    />
                  </Show>
                </div>
              </Resize.Panel>

              <SoupPreviewPane root={root} />
            </Resize.Zone>
          </div>
        </SoupViewRoot>
      </SoupFileDropzone>

      <Suspense>
        <Show when={ENABLE_UNIFIED_LIST_AI_INPUT && !isMobile()}>
          <SoupChatInput />
        </Show>
      </Suspense>
    </SplitPanelContext.Provider>
  );
}
