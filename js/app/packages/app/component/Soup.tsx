import {
  useGlobalBlockOrchestrator,
  useGlobalNotificationSource,
} from '@app/component/GlobalAppState';
import { useHandleFileUpload } from '@app/util/handleFileUpload';
import { playSound } from '@app/util/sound';
import { useIsAuthenticated } from '@core/auth';
import type { BlockAliasContext } from '@core/block';
import { FileDropOverlay } from '@core/component/FileDropOverlay';
import { Button } from '@core/component/FormControls/Button';
import { SegmentedControl } from '@core/component/FormControls/SegmentControls';
import { ToggleButton } from '@core/component/FormControls/ToggleButton';
import {
  ContextMenuContent,
  MENU_CONTENT_CLASS,
  MenuItem,
  MenuSeparator,
} from '@core/component/Menu';
import { fileTypeToResolvedBlockName } from '@core/constant/allBlocks';
import { fileFolderDrop } from '@core/directive/fileFolderDrop';
import { TOKENS } from '@core/hotkey/tokens';
import type { RegisterHotkeyReturn } from '@core/hotkey/types';
import type { BlockOrchestrator } from '@core/orchestrator';
import { ENABLE_SAVED_VIEWS } from '@core/constant/featureFlags';
import {
  DEFAULT_VIEWS,
  type DefaultView,
  type ViewId,
  type ViewLabel,
} from '@core/types/view';
import { handleFileFolderDrop } from '@core/util/upload';
import { ContextMenu } from '@kobalte/core/context-menu';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import { Tabs } from '@kobalte/core/tabs';
import type { EntityData } from '@macro-entity';
import {
  isTaskEntity,
  queryKeys,
  useQueryClient as useEntityQueryClient,
} from '@macro-entity';
import { createEffectOnEntityTypeNotification } from '@notifications';
import { storageServiceClient } from '@service-storage/client';
import { Navigate } from '@solidjs/router';
import { useMutation, useQueryClient } from '@tanstack/solid-query';
import { createDroppable, useDragDropContext } from '@thisbeyond/solid-dnd';
import { registerHotkey } from 'core/hotkey/hotkeys';
import {
  type Component,
  createEffect,
  createMemo,
  createRenderEffect,
  createSignal,
  For,
  Match,
  onCleanup,
  type ParentComponent,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { EntityModal } from './EntityModal/EntityModal';
import { SuspenseContextComp } from './SuspenseContext';
import { SplitTabs } from './split-layout/components/SplitTabs';
import { SplitHeaderLeft } from './split-layout/components/SplitHeader';
import type { SplitPanelContextType } from './split-layout/context';
import { SplitPanelContext } from './split-layout/context';
import { useSplitPanelOrThrow } from './split-layout/layoutUtils';
import { UnifiedListView } from './UnifiedListView';
import {
  VIEWCONFIG_BASE,
  VIEWCONFIG_DEFAULTS_IDS,
  type DocumentTypeFilter,
  type ViewConfigBase,
} from './ViewConfig';

false && fileFolderDrop;

const ViewTab: ParentComponent<{
  viewId: ViewId;
}> = (props) => {
  return (
    <Tabs.Content class="flex flex-col size-full" value={props.viewId}>
      {/* If Kobalte TabContent recieves Suspense as direct child, Suspense owner doesn't cleanup and causes memory leak */}
      {/* Make sure Suspense isn't root child by by wrapping children with DOM node */}
      <div class="contents">{props.children}</div>
    </Tabs.Content>
  );
};

const ViewWithSearch: Component<{
  viewId: ViewId;
}> = (props) => {
  return (
    <ViewTab viewId={props.viewId}>
      <Switch>
        <Match
          when={props.viewId === 'email' && DEFAULT_VIEWS.includes('email')}
        >
          <Suspense>
            <EmailView />
          </Suspense>
        </Match>
        <Match when={props.viewId === 'all' && DEFAULT_VIEWS.includes('all')}>
          <Suspense>
            <AllView />
          </Suspense>
        </Match>
        <Match when={true}>
          <SuspenseContextComp fallback={''}>
            <UnifiedListView />
          </SuspenseContextComp>
        </Match>
      </Switch>
    </ViewTab>
  );
};

const PreviewPanelContent: Component<{
  selectedEntity: EntityData;
  orchestrator: BlockOrchestrator;
  splitPanelContext: SplitPanelContextType;
}> = (props) => {
  const blockInstance = () => {
    const aliasContext = isTaskEntity(props.selectedEntity)
      ? ({
          alias: 'task',
          baseType: 'md',
        } as BlockAliasContext)
      : undefined;
    return props.orchestrator.createBlockInstance(
      props.selectedEntity.type === 'document'
        ? fileTypeToResolvedBlockName(props.selectedEntity.fileType)
        : props.selectedEntity.type,
      props.selectedEntity.id,
      { aliasContext }
    );
  };
  const [interactedWith, setInteractedWith] = createSignal(false);

  createRenderEffect((prevId: string) => {
    const id = props.selectedEntity.id;
    if (id !== prevId) {
      setInteractedWith(false);
    }
    return id;
  }, props.selectedEntity.id);

  const previewLayoutRefs: SplitPanelContextType['layoutRefs'] = {
    ...props.splitPanelContext.layoutRefs,
    // Don't allow preview-pane content to mount into the parent split header.
    headerLeft: undefined,
    headerRight: undefined,
    // Provide preview-local toolbar mounts (wired up below).
    toolbarLeft: undefined,
    toolbarRight: undefined,
  };

  return (
    <div
      class="size-full flex flex-col min-h-0"
      onFocusIn={(event) => {
        if (interactedWith()) return;
        const relatedTarget = event.relatedTarget as HTMLElement;
        const currentTarget = event.currentTarget as HTMLElement;

        // TODO: use state instead to determine when preview block can recieve focus
        if (event.target.hasAttribute('data-allow-focus-in-preview')) {
          setInteractedWith(true);
          return;
        }

        if (!currentTarget.contains(relatedTarget)) {
          relatedTarget.focus();
        }
      }}
      onPointerDown={() => {
        setInteractedWith(true);
      }}
    >
      {/*
       * In unified-list preview mode we render *another* block inside the same split panel.
       * If we allow that block to use the parent split's toolbar refs, its SplitToolbar portals
       * will mount at the top of the unified list (full-width). Instead, give the preview pane
       * its own toolbar mount points so toolbars render inside the preview pane.
       */}
      <SplitPanelContext.Provider
        value={{
          ...props.splitPanelContext,
          layoutRefs: previewLayoutRefs,
        }}
      >
        <div
          class="relative w-full flex items-center justify-between shrink-0 h-10 px-1 border-b border-edge-muted/50 bg-panel"
          data-preview-pane-toolbar
        >
          <div
            class="flex h-full items-center flex-1 gap-1.5 px-2"
            ref={(ref) => {
              previewLayoutRefs.toolbarLeft = ref;
            }}
          />
          <div
            class="flex h-full items-center"
            ref={(ref) => {
              previewLayoutRefs.toolbarRight = ref;
            }}
          />
        </div>
        <div class="flex-1 min-h-0">
          <Dynamic component={blockInstance().element} />
        </div>
      </SplitPanelContext.Provider>
    </div>
  );
};

const PreviewPanel: Component<{
  selectedEntity: EntityData | undefined;
  orchestrator: BlockOrchestrator;
  splitPanelContext: SplitPanelContextType;
}> = (props) => {
  return (
    <div class="flex flex-row size-full sm:w-[70%] max-sm:h-[50%] max-sm:border-t border-edge-muted shrink-0 sm:shadow-inner">
      <Show
        when={props.selectedEntity?.type !== 'project' && props.selectedEntity}
      >
        {(selectedEntity) => (
          <PreviewPanelContent
            selectedEntity={selectedEntity()}
            orchestrator={props.orchestrator}
            splitPanelContext={props.splitPanelContext}
          />
        )}
      </Show>
    </div>
  );
};

export function Soup() {
  const authenticated = useIsAuthenticated();
  if (!authenticated()) return <Navigate href="/" />;

  const splitPanelContext = useSplitPanelOrThrow();
  const {
    handle,
    splitHotkeyScope,
    unifiedListContext: {
      viewsDataStore: viewsData,
      setViewDataStore,
      selectedView,
      setSelectedView,
      entityListRefSignal: [, setEntityListRef],
    },
  } = splitPanelContext;
  const view = createMemo(() => viewsData[selectedView()]);
  const previewState = () => splitPanelContext.previewState;
  const [preview, setPreview] = previewState();
  const selectedEntity = () => view().selectedEntity;

  // Sync selected view to split metadata
  createEffect(() => {
    handle.updateMeta?.({ viewId: selectedView() });
  });

  const orchestrator = useGlobalBlockOrchestrator();

  const entityQueryClient = useEntityQueryClient();

  const hotkeyDisposers: RegisterHotkeyReturn[] = [];

  hotkeyDisposers.push(
    registerHotkey({
      hotkey: ['p'],
      scopeId: splitHotkeyScope,
      description: 'Toggle Preview',
      hotkeyToken: TOKENS.unifiedList.togglePreview,
      keyDownHandler: () => {
        playSound('open');
        setPreview((prev) => !prev);
        return true;
      },
      // displayPriority: 10,
    })
  );

  hotkeyDisposers.push(
    ...(ENABLE_SAVED_VIEWS
      ? [
          registerHotkey({
            hotkey: ['0'],
            scopeId: splitHotkeyScope,
            description: 'Open saved views',
            keyDownHandler: () => {
              setSavedViewsOpen(true);
              setTimeout(() => savedViewsTriggerEl?.focus(), 0);
              return true;
            },
            hide: true,
          }),
        ]
      : [])
  );

  const [isDragging, setIsDragging] = createSignal(false);
  const [isValidDrag, setIsValidDrag] = createSignal(true);
  const [savedViewsOpen, setSavedViewsOpen] = createSignal(false);
  let savedViewsTriggerEl: HTMLButtonElement | undefined;

  const droppableId = 'soup-drop-zone';
  const droppable = createDroppable(droppableId);

  const dragDropContext = useDragDropContext();
  if (dragDropContext) {
    dragDropContext[1].onDragEnd((event) => {
      if (!event.droppable || event.droppable.id !== droppableId) return;

      // TODO: moveToFolder action
    });
  }

  const handleFileUpload = useHandleFileUpload();

  const notificationSource = useGlobalNotificationSource();
  createEffectOnEntityTypeNotification(
    notificationSource,
    'channel',
    (notification) => {
      entityQueryClient.invalidateQueries({
        queryKey: queryKeys.all.channel,
      });
      entityQueryClient.invalidateQueries({
        queryKey: queryKeys.notification({
          entity_id: notification.entity_id,
        }),
      });
    }
  );

  createEffectOnEntityTypeNotification(notificationSource, 'email', () => {
    entityQueryClient.invalidateQueries({
      // HACK: this needs to be improved, since we use a single query, per entity invalidations
      // become a little more complicated.
      queryKey: queryKeys.all.entity,
    });
  });

  const saveViewMutation = useUpsertSavedViewMutation();

  let tabsRef: HTMLDivElement | undefined;
  const [filesMenuWidth, setFilesMenuWidth] = createSignal(0);

  const customViews = createMemo(() => {
    return Object.values(viewsData)
      .filter(Boolean)
      .filter((v) => !VIEWCONFIG_DEFAULTS_IDS.includes(v.id as DefaultView))
      .sort((a, b) => a.view.localeCompare(b.view));
  });

  onCleanup(() => {
    setEntityListRef(undefined);
    hotkeyDisposers.forEach((disposer) => disposer.dispose());
  });

  const TabContextMenu = (props: { value: ViewId; label: string }) => {
    const [isModalOpen, setIsModalOpen] = createSignal(false);
    const isDefaultView = () =>
      VIEWCONFIG_DEFAULTS_IDS.includes(props.value as DefaultView);
    return (
      <Show when={!isDefaultView()}>
        <ContextMenu>
          <ContextMenu.Trigger class="absolute inset-0" />
          <ContextMenu.Portal>
            <ContextMenuContent mobileFullScreen>
              <MenuItem
                text="Rename"
                disabled={isDefaultView()}
                onClick={() => {
                  setTimeout(() => {
                    setIsModalOpen(true);
                  });
                  // Don't mutate here, let the modal handle it
                }}
              />
              <MenuItem
                text="Delete"
                disabled={isDefaultView()}
                onClick={() => {
                  saveViewMutation.mutate({
                    id: props.value,
                  });
                }}
              />
            </ContextMenuContent>
          </ContextMenu.Portal>
        </ContextMenu>
        <EntityModal
          isOpen={isModalOpen}
          setIsOpen={setIsModalOpen}
          view={() => 'rename'}
          viewId={props.value}
        />
      </Show>
    );
  };

  return (
    <div
      class="relative flex flex-col bg-panel size-full"
      use:droppable
      use:fileFolderDrop={{
        onDrop: (fileEntries, folderEntries) => {
          handleFileFolderDrop(fileEntries, folderEntries, handleFileUpload);
        },
        onDragStart: () => {
          setIsValidDrag(true);
          setIsDragging(true);
        },
        onDragEnd: () => setIsDragging(false),
      }}
    >
      <Show when={isDragging() || droppable.isActiveDroppable}>
        <FileDropOverlay valid={isValidDrag()}>
          <Show when={!isValidDrag()}>
            <div class="font-mono text-failure">[!] Invalid file type</div>
          </Show>
          <div class="font-mono">
            Drop any file here to add it to your workspace
          </div>
        </FileDropOverlay>
      </Show>

      <div class="relative flex-grow min-h-0 flex max-sm:flex-col flex-row size-full">
        <SplitPanelContext.Provider
          value={{
            ...splitPanelContext,
            halfSplitState: () =>
              preview() ? { side: 'left', percentage: 30 } : undefined,
          }}
        >
          <Tabs
            ref={tabsRef}
            class="@container/soup [container-type:inline-size] flex flex-col gap-1 size-full overflow-x-clip"
            classList={{
              'border-r border-edge-muted': preview(),
            }}
            value={selectedView()}
            onChange={setSelectedView}
          >
            <SplitHeaderLeft order={-2}>
              <div class="flex items-center h-full">
                <div>
                  <Show when={ENABLE_SAVED_VIEWS}>
                    <DropdownMenu
                      placement="bottom-start"
                      open={savedViewsOpen()}
                      onOpenChange={setSavedViewsOpen}
                    >
                      <DropdownMenu.Trigger
                        as="button"
                        ref={(el) => {
                          savedViewsTriggerEl = el;
                        }}
                        class="border border-edge-muted min-w-[22px] font-medium font-mono text-center uppercase leading-none whitespace-nowrap text-xs p-1 text-ink-muted hover:opacity-80"
                      >
                        <span class="opacity-70 mr-1 text-[10px]">0</span>
                        <span class="text-[0.625rem]">Views</span>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          class={`${MENU_CONTENT_CLASS} py-1 w-44`}
                        >
                          <Show
                            when={customViews().length > 0}
                            fallback={<MenuItem text="No custom views" disabled />}
                          >
                            <For each={customViews()}>
                              {(v) => (
                                <MenuItem
                                  text={v.view}
                                  onClick={() => setSelectedView(v.id)}
                                />
                              )}
                            </For>
                          </Show>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu>
                  </Show>
                </div>

                <SplitTabs
                  // Keep internal "all" in the Tabs trigger list (rendered invisibly by SplitTabs),
                  // so the controlled Tabs value always has a corresponding trigger.
                  list={Object.values(viewsData).map((view, index) => ({
                    value: view.id,
                    label: view.view,
                    index: index,
                  }))}
                  active={selectedView}
                  contextMenu={
                    ENABLE_SAVED_VIEWS
                      ? ({ value, label }) => (
                          <TabContextMenu value={value} label={label} />
                        )
                      : undefined
                  }
                  tabAddon={({ value, triggerEl, active }) => {
                    if (value !== 'files') return <></>;
                    const docTypes = (): DocumentTypeFilter[] =>
                      (viewsData.files?.filters?.documentTypeFilter ??
                        []) as DocumentTypeFilter[];
                    const setChecked = (t: DocumentTypeFilter, checked: boolean) => {
                      setViewDataStore(
                        'files',
                        'filters',
                        'documentTypeFilter',
                        (prev) => {
                          const set = new Set(prev ?? []);
                          if (checked) set.add(t);
                          else set.delete(t);
                          return Array.from(set);
                        }
                      );
                    };
                    const clearAll = () => {
                      setViewDataStore('files', 'filters', 'documentTypeFilter', []);
                    };
                    return (
                      <div class="-ml-px">
                        <DropdownMenu
                          placement="bottom-start"
                          onOpenChange={(open) => {
                            if (!open) return;
                            const w =
                              triggerEl?.getBoundingClientRect().width ?? 0;
                            setFilesMenuWidth(Math.floor(w));
                          }}
                        >
                          <DropdownMenu.Trigger
                            as="button"
                            class="border border-edge-muted border-l-0 min-w-[22px] font-medium font-mono text-center uppercase leading-none whitespace-nowrap text-xs p-1 hover:opacity-80 bg-panel"
                            classList={{
                              'bg-edge-muted text-ink': active,
                              'text-ink-muted': !active,
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span
                              class="text-[0.625rem]"
                              classList={{
                                'text-ink': active,
                                'text-ink-muted': !active,
                              }}
                            >
                              ▾
                            </span>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              class={`${MENU_CONTENT_CLASS} py-1`}
                              style={{
                                width: filesMenuWidth()
                                  ? `${filesMenuWidth()}px`
                                  : undefined,
                              }}
                            >
                              <MenuItem text="All" onClick={clearAll} />
                              <MenuSeparator />
                              <MenuItem
                                text="Note"
                                selectorType="checkbox"
                                checked={docTypes().includes('md')}
                                closeOnSelect={false}
                                onChange={(checked) => setChecked('md', checked)}
                              />
                              <MenuItem
                                text="PDF"
                                selectorType="checkbox"
                                checked={docTypes().includes('pdf')}
                                closeOnSelect={false}
                                onChange={(checked) =>
                                  setChecked('pdf', checked)
                                }
                              />
                              <MenuItem
                                text="Canvas"
                                selectorType="checkbox"
                                checked={docTypes().includes('canvas')}
                                closeOnSelect={false}
                                onChange={(checked) =>
                                  setChecked('canvas', checked)
                                }
                              />
                              <MenuItem
                                text="Code"
                                selectorType="checkbox"
                                checked={docTypes().includes('code')}
                                closeOnSelect={false}
                                onChange={(checked) =>
                                  setChecked('code', checked)
                                }
                              />
                              <MenuItem
                                text="Image"
                                selectorType="checkbox"
                                checked={docTypes().includes('image')}
                                closeOnSelect={false}
                                onChange={(checked) =>
                                  setChecked('image', checked)
                                }
                              />
                              <MenuItem
                                text="Other"
                                selectorType="checkbox"
                                checked={docTypes().includes('unknown')}
                                closeOnSelect={false}
                                onChange={(checked) =>
                                  setChecked('unknown', checked)
                                }
                              />
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu>
                      </div>
                    );
                  }}
                />
              </div>
            </SplitHeaderLeft>
            <For each={Object.keys(viewsData)}>
              {(viewId) => <ViewWithSearch viewId={viewId} />}
            </For>
          </Tabs>
        </SplitPanelContext.Provider>
        <Show when={preview()}>
          <PreviewPanel
            selectedEntity={selectedEntity()}
            orchestrator={orchestrator}
            splitPanelContext={splitPanelContext}
          />
        </Show>
      </div>
    </div>
  );
}

function AllView() {
  return <UnifiedListView />;
}

function EmailView() {
  return <UnifiedListView />;
}

export const useUpsertSavedViewMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: async (
      viewData:
        | {
            config: ViewConfigBase;
            id?: ViewId;
            name: ViewLabel;
          }
        | {
            id: ViewId;
          }
    ) => {
      const isDefaultView = VIEWCONFIG_DEFAULTS_IDS.includes(
        viewData.id as DefaultView
      );
      if ('config' in viewData) {
        // if data id is in defaults, exclude default, set up args to create new view
        if (isDefaultView) {
          // don't exclude default view on editing default view config
          // await storageServiceClient.views.excludeDefaultView({
          //   defaultViewId: viewData.id!,
          // });
          viewData.id = undefined;
          viewData.name = `My ${viewData.name}`;
        }
        // create new view
        if (!viewData.id) {
          return await storageServiceClient.views.createSavedView({
            name: viewData.name,
            config: viewData.config,
          });
        } // patch existing view
        else {
          return await storageServiceClient.views.patchView({
            saved_view_id: viewData.id,
            name: viewData.name,
            config: viewData.config,
          });
        }
      } else {
        // delete or exclude view
        if (isDefaultView) {
          // for now don't exclude default view
          // return await storageServiceClient.views.excludeDefaultView({
          //   defaultViewId: viewData.id,
          // });
        } else {
          return await storageServiceClient.views.deleteView({
            savedViewId: viewData.id,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedViews'] });
    },
  }));
};
