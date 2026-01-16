import { useGlobalBlockOrchestrator } from '@app/component/GlobalAppState';
import { PreviewPanel } from '@app/component/PreviewPanel';
import { SplitPanelContext } from '@app/component/split-layout/context';
import {
  type FileOperation,
  SplitFileMenu,
} from '@app/component/split-layout/components/SplitFileMenu';
import { SplitHeaderLeft } from '@app/component/split-layout/components/SplitHeader';
import {
  BlockItemSplitLabel,
  SplitPermissionsBadge,
} from '@app/component/split-layout/components/SplitLabel';
import {
  SplitToolbarLeft,
  SplitToolbarRight,
} from '@app/component/split-layout/components/SplitToolbar';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { UnifiedListView } from '@app/component/UnifiedListView';
import { PROJECT_VIEWCONFIG_BASE } from '@app/component/ViewConfig';
import { playSound } from '@app/util/sound';
import { getIsSpecialProject } from '@block-project/isSpecial';
import { useBlockId } from '@core/block';
import { DocumentBlockContainer } from '@core/component/DocumentBlockContainer';
import { FileDropOverlay } from '@core/component/FileDropOverlay';
import { ShareButton } from '@core/component/TopBar/ShareButton';
import {
  ENABLE_PROJECT_SHARING,
  ENABLE_PROJECT_VIEW_PREVIEW,
} from '@core/constant/featureFlags';
import { fileFolderDrop } from '@core/directive/fileFolderDrop';
import { fileSelector } from '@core/directive/fileSelector';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import {
  useCanEdit,
  useGetPermissions,
  useIsDocumentOwner,
} from '@core/signal/permissions';
import {
  handleFileFolderDrop,
  type UploadInput,
  uploadFiles,
} from '@core/util/upload';
import { buildSimpleEntityUrl } from '@core/util/url';
import {
  queryKeys,
  useQueryClient as useEntityQueryClient,
} from '@macro-entity';
import { refetchResources } from '@service-storage/util/refetchResources';
import { toast } from 'core/component/Toast/Toast';
import {
  type Component,
  createMemo,
  createRenderEffect,
  createSignal,
  onCleanup,
  Show,
  untrack,
} from 'solid-js';
import { projectBlockDataSignal } from '../signal/projectBlockData';
import { ProjectCreateMenu } from './ProjectCreateMenu';
import { ProjectPropertiesModal } from './ProjectPropertiesModal';

// HACK: prevent lint error on custom directive
false && fileFolderDrop;
false && fileSelector;

function ProjectTopBar() {
  const splitPanelContext = useSplitPanelOrThrow();
  const [preview] = splitPanelContext.previewState;
  const id = useBlockId();
  const isSpecialProject = getIsSpecialProject(id);
  const permissions = useGetPermissions();
  const isOwner = useIsDocumentOwner();
  const canEdit = useCanEdit();
  const name = () => projectBlockDataSignal()?.projectMetadata.name ?? '';
  const owner = () => projectBlockDataSignal()?.projectMetadata.userId;

  function handleCopyLink() {
    navigator.clipboard.writeText(
      buildSimpleEntityUrl(
        {
          type: 'project',
          id,
        },
        {}
      )
    );
    toast.success('Link copied to clipboard');
  }

  const ops = createMemo<FileOperation[]>(() => [
    ...(isOwner() && !isSpecialProject
      ? [
          { op: 'rename' as const },
          { op: 'moveToProject' as const },
          { op: 'delete' as const, divideAbove: true },
        ]
      : []),
  ]);

  const showToolbarRight = () => {
    if (!ENABLE_PROJECT_VIEW_PREVIEW) return true;
    return !preview();
  };

  return (
    <>
      <SplitHeaderLeft>
        <BlockItemSplitLabel fallbackName={name()} />
      </SplitHeaderLeft>
      <SplitToolbarLeft class="flex-0">
        <div class="flex gap-2 p-1">
          <Show when={ops().length > 0}>
            <SplitFileMenu
              id={id}
              itemType="project"
              name={name()}
              ops={ops()}
            />
            <Show when={canEdit()}>
              <ProjectCreateMenu id={id} />
            </Show>
          </Show>
        </div>
      </SplitToolbarLeft>
      <Show when={showToolbarRight()}>
        <SplitToolbarRight>
          <div class="flex items-center p-1">
            <div class="flex items-center">
              <Show when={!isSpecialProject}>
                <ProjectPropertiesModal buttonSize="sm" name={name()} />
              </Show>
              <SplitPermissionsBadge />
              <Show when={ENABLE_PROJECT_SHARING && !isSpecialProject}>
                <ShareButton
                  id={id}
                  name={name()}
                  userPermissions={permissions()}
                  copyLink={handleCopyLink}
                  itemType="project"
                  owner={owner()}
                />
              </Show>
            </div>
          </div>
        </SplitToolbarRight>
      </Show>
    </>
  );
}

const Block: Component = () => {
  const [isDragging, setIsDragging] = createSignal(false);
  const projectId = useBlockId();
  const isSpecialProject = getIsSpecialProject(projectId);
  const name = () => projectBlockDataSignal()?.projectMetadata.name;
  const entityQueryClient = useEntityQueryClient();

  const handleFileUpload = async (files: UploadInput[]) => {
    if (files.length === 0) return;

    // Don't allow uploads to root or trash
    if (isSpecialProject) {
      toast.failure('Cannot upload files to this location');
      return;
    }

    try {
      const results = await uploadFiles(files, 'dss', {
        projectId,
      });

      const uploads = results.filter((result) => !result.failed);

      // show documents that were immediately uploaded
      const successfulUploads = uploads.filter((result) => !result.pending);
      if (successfulUploads.length > 0) {
        entityQueryClient.invalidateQueries({
          queryKey: queryKeys.all.dss,
        });
        refetchResources();
      }

      // wait for pending folder uploads to finish upload before refetching resources
      const pendingFolderUploads = uploads
        .filter((result) => result.pending)
        .filter((result) => result.type === 'folder')
        .map((result) => result.projectId);
      if (pendingFolderUploads.length > 0) {
        await Promise.all(pendingFolderUploads);
        entityQueryClient.invalidateQueries({
          queryKey: queryKeys.all.dss,
        });
        refetchResources();
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.failure('Upload failed. Please try again.');
    }
  };

  const orchestrator = useGlobalBlockOrchestrator();
  const splitPanelContext = useSplitPanelOrThrow();
  const {
    selectedView,
    setSelectedView,
    setViewDataStore,
    isRenderedFromPreview,
    viewsDataStore: viewsData,
  } = splitPanelContext.soupContext;
  const [preview, setPreview] = splitPanelContext.previewState;
  const view = createMemo(() => viewsData[selectedView()]);
  const selectedEntity = () => view().selectedEntity;

  if (!isRenderedFromPreview) {
    registerHotkey({
      hotkey: ['space'],
      scopeId: splitPanelContext.splitHotkeyScope,
      description: 'Toggle Preview',
      hotkeyToken: TOKENS.unifiedList.togglePreview,
      keyDownHandler: () => {
        playSound('open');
        setPreview((prev) => !prev);
        return true;
      },
      hide: true,
    });
  }

  createRenderEffect(() => {
    const previousView = untrack(selectedView);

    setSelectedView(projectId);

    setViewDataStore(projectId, {
      ...PROJECT_VIEWCONFIG_BASE,
      id: projectId,
      view: name() ?? 'folder',
      multiSelectEntities: [],
      filters: {
        ...PROJECT_VIEWCONFIG_BASE.filters,
        projectFilter: projectId,
      },
    });

    onCleanup(() => {
      setSelectedView(previousView);
      setViewDataStore(projectId, undefined);
    });
  });

  return (
    <DocumentBlockContainer>
      <div
        class="w-full h-full bg-panel flex flex-col relative"
        use:fileFolderDrop={{
          onDragStart: () => setIsDragging(true),
          onDragEnd: () => setIsDragging(false),
          onDrop: (fileEntries, folderEntries) => {
            handleFileFolderDrop(fileEntries, folderEntries, handleFileUpload);
          },
          disabled: isSpecialProject,
        }}
      >
        <Show when={isDragging() && !isSpecialProject}>
          <FileDropOverlay>Upload to this folder</FileDropOverlay>
        </Show>
        <ProjectTopBar />
        <Show when={ENABLE_PROJECT_VIEW_PREVIEW} fallback={<UnifiedListView />}>
          <div class="flex size-full">
            <SplitPanelContext.Provider
              value={{
                ...splitPanelContext,
                halfSplitState: () =>
                  preview() ? { side: 'left', percentage: 30 } : undefined,
              }}
            >
              <UnifiedListView hideToolbar={isRenderedFromPreview} />
            </SplitPanelContext.Provider>
            <Show when={preview()}>
              <PreviewPanel
                selectedEntity={selectedEntity()}
                orchestrator={orchestrator}
                splitPanelContext={splitPanelContext}
              />
            </Show>
          </div>
        </Show>
      </div>
    </DocumentBlockContainer>
  );
};

export default Block;
