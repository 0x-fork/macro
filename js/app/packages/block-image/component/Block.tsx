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
import { withAnalytics } from '@coparse/analytics';
import { useBlockId } from '@core/block';
import { DocumentBlockContainer } from '@core/component/DocumentBlockContainer';
import { ReferencesModal } from '@core/component/ReferencesModal';
import { ShareButton } from '@core/component/TopBar/ShareButton';
import { blockAcceptedFileExtensionToMimeType } from '@core/constant/allBlocks';
import { blockFileSignal, blockMetadataSignal } from '@core/signal/load';
import { useGetPermissions } from '@core/signal/permissions';
import { setCopiedItem } from '@core/state/clipboard';
import {
  useBlockDocumentDownloadName,
  useBlockDocumentName,
} from '@core/util/currentBlockDocumentName';
import { downloadFile } from '@filesystem/download';
import Download from '@icon/regular/download.svg';
import { createCallback } from '@solid-primitives/rootless';
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';

const { track, TrackingEvents } = withAnalytics();

function ImageTopBar() {
  const blockId = useBlockId();
  const imageFile = blockFileSignal.get;
  const name = useBlockDocumentName();
  const downloadName = useBlockDocumentDownloadName();
  const userPermissions = useGetPermissions();

  const downloadDocument = createCallback(async () => {
    const file = imageFile();
    if (!file) return;
    downloadFile(file, downloadName());
  });

  const ops: FileOperation[] = [
    { op: 'pin' },
    { op: 'rename' },
    { op: 'copy' },
    { op: 'moveToProject' },
    {
      label: 'Download',
      icon: Download,
      action: downloadDocument,
      divideAbove: true,
    },
    { op: 'delete', divideAbove: true },
  ];

  return (
    <>
      <SplitHeaderLeft>
        <BlockItemSplitLabel />
      </SplitHeaderLeft>
      <SplitToolbarLeft>
        <div class="p-1">
          <SplitFileMenu
            id={blockId}
            itemType="document"
            name={name()}
            ops={ops}
          />
        </div>
      </SplitToolbarLeft>
      <SplitToolbarRight>
        <div class="flex items-center p-1">
          <ReferencesModal
            documentId={blockId}
            documentName={name()}
            buttonSize="sm"
          />
          <div class="flex items-center">
            <SplitPermissionsBadge />
            <ShareButton
              id={blockId}
              name={name()}
              userPermissions={userPermissions()}
              itemType="document"
              owner={blockMetadataSignal()?.owner}
            />
          </div>
        </div>
      </SplitToolbarRight>
    </>
  );
}

export default function BlockImage() {
  const documentId = useBlockId();

  const [imageUrl, setImageUrl] = createSignal<string>();

  onMount(() => {
    track(TrackingEvents.BLOCKIMAGE.OPEN);
  });

  const [fileArrayBuffer, setFileArrayBuffer] = createSignal<ArrayBuffer>();
  createEffect(() => {
    const file = blockFileSignal();
    if (!file) return;

    file.arrayBuffer().then(setFileArrayBuffer);
  });

  createEffect(() => {
    try {
      const ext = blockMetadataSignal()?.fileType;
      if (ext == null) return;
      const mime = blockAcceptedFileExtensionToMimeType[ext];

      const arrayBuffer = fileArrayBuffer();
      if (!arrayBuffer) return;
      const blob = new Blob([arrayBuffer], { type: mime });
      const url = URL.createObjectURL(blob);
      setImageUrl(url);

      onCleanup(() => {
        URL.revokeObjectURL(url);
      });
    } catch (error) {
      console.error('Error converting array buffer:', error);
    }
  });

  onMount(() => {
    const copyBlockHandler = (e: KeyboardEvent) => {
      if (e.key === 'c' && e.metaKey) {
        setCopiedItem({
          type: 'document',
          id: documentId,
        });
      }
    };
    window.addEventListener('keydown', copyBlockHandler);
    onCleanup(() => {
      window.removeEventListener('keydown', copyBlockHandler);
    });
  });

  return (
    <DocumentBlockContainer>
      <div class="w-full h-full bg-panel select-none overscroll-none overflow-hidden flex flex-col">
        <ImageTopBar />
        <Show
          when={imageUrl()}
          fallback={
            <div class="w-full h-full flex items-center justify-center">
              {/* Loading state handled by DocumentBlockContainer */}
            </div>
          }
        >
          <div class="w-full h-full flex items-center justify-center">
            <img
              src={imageUrl()}
              alt={blockMetadataSignal()?.documentName || 'Image'}
              class="max-w-full max-h-full object-contain"
            />
          </div>
        </Show>
      </div>
    </DocumentBlockContainer>
  );
}
