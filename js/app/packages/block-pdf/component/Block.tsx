import './block.css';

import {
  type FileOperation,
  SplitFileMenu,
} from '@app/component/split-layout/components/SplitFileMenu';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import {
  BlockItemSplitLabel,
  SplitPermissionsBadge,
} from '@app/component/split-layout/components/SplitLabel';
import {
  SplitToolbarLeft,
  SplitToolbarRight,
} from '@app/component/split-layout/components/SplitToolbar';
import {
  type LocationBlockParams,
  LocationType,
  locationChangedSignal,
  pendingLocationParamsSignal,
  useCreateShareUrl,
} from '@block-pdf/signal/location';
import { showTabBarSignal } from '@block-pdf/signal/placeables';
import { useHasModificationData } from '@block-pdf/signal/save';
import { useHasComments } from '@block-pdf/store/comments/commentStore';
import { doPrint } from '@block-pdf/util/printUtil';
import { exportPdf } from '@block-pdf/websocket/export';
import { withAnalytics } from '@coparse/analytics';
import { useIsAuthenticated } from '@core/auth';
import { useBlockId, useIsNestedBlock } from '@core/block';
import { DocumentBlockContainer } from '@core/component/DocumentBlockContainer';
import { DocumentPropertiesModal } from '@core/component/DocumentPropertiesModal';
import { BlockLiveIndicators } from '@core/component/LiveIndicators';
import { ReferencesModal } from '@core/component/ReferencesModal';
import { openLoginModal } from '@core/component/TopBar/LoginButton';
import { ShareButton } from '@core/component/TopBar/ShareButton';
import {
  ENABLE_PDF_MARKUP,
  ENABLE_REFERENCES_MODAL,
} from '@core/constant/featureFlags';
import { blockHandleSignal, blockMetadataSignal } from '@core/signal/load';
import { useGetPermissions } from '@core/signal/permissions';
import { useBlockDocumentName } from '@core/util/currentBlockDocumentName';
import { downloadFile } from '@filesystem/download';
import DownloadIcon from '@icon/regular/download-simple.svg';
import Printer from '@icon/regular/printer.svg';
import { storageServiceClient } from '@service-storage/client';
import { createCallback } from '@solid-primitives/rootless';
import { debounce, leading } from '@solid-primitives/scheduled';
import { type BeforeLeaveEventArgs, useBeforeLeave } from '@solidjs/router';
import { toast } from 'core/component/Toast/Toast';
import { createMethodRegistration } from 'core/orchestrator';
import { platformFetch } from 'core/util/platformFetch';
import {
  createEffect,
  createResource,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { reconcile } from 'solid-js/store';
import { fromZodError } from 'zod-validation-error';
import { keyedTermDataStore } from '../PdfViewer/TermDataStore';
import {
  pdfDocumentProxy,
  pdfModificationDataStore,
  pdfOverlays,
  pdfViewLocation,
} from '../signal/document';
import { pdfBlockDataSignal } from '../signal/pdfBlockData';
import {
  isSaving as isSavingSignal,
  serverModificationDataSignal,
  usePdfSave,
} from '../signal/save';
import { useUpdateColorsEffect } from '../signal/setting';
import { useTableOfContentsUpdate } from '../store/tableOfContents';
import {
  IModificationDataOnServerSchema,
  transformModificationDataToClient,
} from '../type/coParse';
import { preprocess } from '../websocket/preprocess';
import { Document } from './Document';
import { MarkupToolbar } from './MarkupToolbar';
import { PageNumberInput } from './PageNumberInput';
import { Tabs } from './Tabs';

const { track, TrackingEvents } = withAnalytics();

function PdfTopBar() {
  const isAuth = useIsAuthenticated();
  const documentId = useBlockId();
  const hasModificationData = useHasModificationData();
  const hasComments = useHasComments();
  const fileName = useBlockDocumentName('Unknown Filename');
  const userPermissions = useGetPermissions();

  const fileType = blockMetadataSignal()?.fileType;

  const createShareUrl = useCreateShareUrl();
  const copyLink = () => {
    createShareUrl(LocationType.General);
    toast.success('Link copied to clipboard');
  };

  const printFile = createCallback(async () => {
    if (!isAuth()) return openLoginModal();

    const documentProxy = pdfDocumentProxy();
    if (!documentProxy) return;

    const data = (await documentProxy.getData()) as Uint8Array<ArrayBuffer>;
    const blob = new Blob([data], { type: 'application/pdf' });

    return doPrint(blob);
  });

  const download = createCallback(async () => {
    if (!isAuth()) return openLoginModal();

    const documentProxy = pdfDocumentProxy();
    if (!documentProxy) return toast.failure('Unable to download file');

    const data = (await documentProxy.getData()) as Uint8Array<ArrayBuffer>;
    const blob = new Blob([data], { type: 'application/pdf' });

    const fileNameWithExtension = `${fileName()}.pdf`;

    try {
      // No need to export if there are no modifications
      // comments are outside of the modification data so handled separately
      if (!hasModificationData() && hasComments() === false)
        return downloadFile(blob, fileNameWithExtension);

      // Attempt to export and download
      const exportFile = await exportPdf({
        documentId,
        fileName: fileName(),
      });
      downloadFile(exportFile, fileNameWithExtension);
    } catch (_) {
      try {
        downloadFile(blob, fileNameWithExtension);
      } catch (_) {
        toast.failure('Unable to download file');
      }
    }
  });

  const downloadDocx = createCallback(async () => {
    if (!isAuth()) return openLoginModal();

    const [_, data] = await storageServiceClient.exportDocument({ documentId });
    if (!data) {
      return toast.failure('Unable to download file');
    }

    const fileNameWithExtension = `${fileName()}.docx`;

    try {
      // Fetch the file from the presigned URL
      const response = await platformFetch(data.presigned_url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get the file data as array buffer
      const arrayBuffer = await response.arrayBuffer();

      // Create blob with proper MIME type for DOCX
      const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      downloadFile(blob, fileNameWithExtension);

      toast.success('File downloaded successfully');
    } catch (error) {
      console.error('Download failed:', error);
      toast.failure('Failed to download file');
    }
  });

  const ops: FileOperation[] = [
    { op: 'pin' },
    { op: 'rename' },
    { op: 'copy' },
    { op: 'moveToProject' },
    {
      label: 'Print',
      icon: Printer,
      action: () => printFile(),
      divideAbove: true,
    },
    {
      label: 'Download',
      icon: DownloadIcon,
      action: download,
    },
    ...(fileType === 'docx'
      ? [
          {
            label: 'Download Docx',
            icon: DownloadIcon,
            action: downloadDocx,
          } as const,
        ]
      : []),
    { op: 'delete', divideAbove: true },
  ];

  return (
    <>
      <SplitHeaderLeft>
        <BlockItemSplitLabel />
      </SplitHeaderLeft>
      <SplitHeaderRight>
        <BlockLiveIndicators />
      </SplitHeaderRight>
      <SplitToolbarLeft>
        <Show when={pdfDocumentProxy()}>
          <div class="flex items-center p-1">
            <SplitFileMenu
              id={documentId}
              itemType="document"
              name={fileName()}
              ops={ops}
            />
            <div class="w-5" />
            <PageNumberInput />
            <div class="w-5" />
            {ENABLE_PDF_MARKUP && <MarkupToolbar />}
          </div>
        </Show>
      </SplitToolbarLeft>
      <SplitToolbarRight>
        <div class="flex items-center p-1">
          <Show when={ENABLE_REFERENCES_MODAL}>
            <ReferencesModal
              documentId={documentId}
              documentName={fileName()}
              buttonSize="sm"
            />
          </Show>
          <DocumentPropertiesModal
            documentId={documentId}
            blockType="pdf"
            buttonSize="sm"
          />
          <div class="flex items-center">
            <SplitPermissionsBadge />
            <ShareButton
              id={documentId}
              name={fileName()}
              userPermissions={userPermissions()}
              copyLink={copyLink}
              itemType="document"
              owner={blockMetadataSignal()?.owner}
            />
          </div>
        </div>
      </SplitToolbarRight>
    </>
  );
}

function onKeyPress(e: KeyboardEvent) {
  if (
    (e.key.toLowerCase() === 's' || e.key === 'z') &&
    // TODO: This is deprecated be careful of updates as this may break
    (navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey)
  ) {
    e.preventDefault();
  }
  if (
    e.key === 'p' &&
    (navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey)
  ) {
    e.preventDefault();
  }
}

export default function BlockPdf() {
  const isNestedBlock = useIsNestedBlock();
  const showTabBar = showTabBarSignal.get;

  const setPdfDocumentProxy = pdfDocumentProxy.set;
  const setPdfViewLocation = pdfViewLocation.set;

  const setPdfModificationData = pdfModificationDataStore.set;
  const setServerModificationData = serverModificationDataSignal.set;

  createEffect(async () => {
    const blockData = pdfBlockDataSignal();
    if (!blockData) return;

    setPdfDocumentProxy(blockData.documentProxy);
    setPdfViewLocation(isNestedBlock ? undefined : blockData.viewLocation);

    if (
      window.location.pathname !== '/app' &&
      window.location.pathname !== '/app/'
    )
      track(TrackingEvents.BLOCKPDF.OPEN);

    const modificationData = blockData.documentMetadata.modificationData;
    if (!modificationData) return;

    const parsedModificationData =
      IModificationDataOnServerSchema.safeParse(modificationData);
    if (parsedModificationData.success) {
      const serverModificationData = parsedModificationData.data;
      setServerModificationData(serverModificationData);

      const transformedModificationData = transformModificationDataToClient(
        serverModificationData
      );
      setPdfModificationData(reconcile(transformedModificationData));
    } else {
      console.error(
        'Failed to parse modification data',
        fromZodError(parsedModificationData.error)
      );
    }
  });

  const [preprocessResource] = createResource(() => {
    const metadata = blockMetadataSignal();
    if (!metadata) return;
    const { documentId, documentVersionId } = metadata;

    return { documentId, documentVersionId };
  }, preprocess);
  const tableOfContentsDispatch = useTableOfContentsUpdate();
  const setPdfOverlays = pdfOverlays.set;
  createEffect(() => {
    const error = preprocessResource.error;
    if (error) return;

    const coparse = preprocessResource.latest;
    if (!coparse) return;

    const store = keyedTermDataStore();
    store?.load(coparse.defs ?? '');
    tableOfContentsDispatch({ type: 'LOAD_AI_TOC', coparse });
    setPdfOverlays(coparse.overlays);
  });

  const savePdf = usePdfSave();
  // use before leave is being called twice
  const debouncedSave = leading(
    debounce,
    (e: BeforeLeaveEventArgs) => {
      e.preventDefault();
      savePdf().then(() => e.retry(true));
    },
    500
  );

  useBeforeLeave((e) => {
    if (isNestedBlock) return;
    debouncedSave(e);
  });

  const isSaving = isSavingSignal.get;
  let beforeUnloadHandler = (e: Event) => {
    if (isNestedBlock) return;
    if (isSaving()) {
      e.preventDefault();
    }
  };

  // used to keep the appearance color synced across tabs
  useUpdateColorsEffect();

  onMount(() => {
    if (isNestedBlock) return;
    window.addEventListener('keydown', onKeyPress);
    window.addEventListener('beforeunload', beforeUnloadHandler);
    onCleanup(() => {
      window.removeEventListener('keydown', onKeyPress);
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    });
  });
  const blockHandle = blockHandleSignal.get;

  const setPendingLocationParamsSignal = pendingLocationParamsSignal.set;
  const setLocationChanged = locationChangedSignal.set;
  const goToLocationFromParams = createCallback(
    (params: LocationBlockParams) => {
      console.log('GO TO LOCATION FROM PARAMS', params);

      setLocationChanged(true);

      // Note: structuredClone was failing here due to proxy nonsense.
      setPendingLocationParamsSignal(JSON.parse(JSON.stringify(params)));
    }
  );

  createMethodRegistration(blockHandle, {
    goToLocationFromParams: async (params: LocationBlockParams) =>
      goToLocationFromParams(params),
  });

  return (
    <DocumentBlockContainer>
      <div
        class="w-full h-full bg-panel select-none overscroll-none overflow-hidden flex flex-col"
        onContextMenu={(e) => e.preventDefault()}
        data-tut="App"
      >
        <Show when={!isNestedBlock}>
          <PdfTopBar />
          <Show when={showTabBar()}>
            <div class="flex px-2 justify-between min-h-11 items-center gap-2">
              <div
                class={`overflow-x-auto overflow-y-hidden grow customScrollbar w-0`}
              >
                <Tabs />
              </div>
            </div>
          </Show>
        </Show>
        <div
          class="flex h-full w-full relative justify-end overflow-visible z-main-view-layout"
          id="main-view"
        >
          {/* {ENABLE_VIEWER_SIDE_PANEL && <ViewerNavStack />} */}
          <Document />
          {/* <CustomCursor /> */}
        </div>
      </div>
    </DocumentBlockContainer>
  );
}
