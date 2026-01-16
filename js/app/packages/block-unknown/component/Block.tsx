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
import { useBlockId } from '@core/block';
import { DeprecatedTextButton } from '@core/component/DeprecatedTextButton';
import { DocumentBlockContainer } from '@core/component/DocumentBlockContainer';
import { ReferencesModal } from '@core/component/ReferencesModal';
import { getPermissions, Permissions } from '@core/component/SharePermissions';
import { ShareButton, ShareModal } from '@core/component/TopBar/ShareButton';
import { blockMetadataSignal } from '@core/signal/load';
import { useGetPermissions } from '@core/signal/permissions';
import {
  useBlockDocumentDownloadName,
  useBlockDocumentName,
} from '@core/util/currentBlockDocumentName';
import { downloadFile } from '@filesystem/download';
import Download from '@icon/regular/download-simple.svg';
import ShareFat from '@icon/regular/share-fat.svg';
import { createCallback } from '@solid-primitives/rootless';
import { toast } from 'core/component/Toast/Toast';
import { createSignal } from 'solid-js';
import { blockData, useGetFileBlob } from '../signal/blockData';

function UnknownTopBar() {
  const blockId = useBlockId();
  const fileName = useBlockDocumentName();
  const downloadName = useBlockDocumentDownloadName();
  const getBlob = useGetFileBlob();
  const userPermissions = useGetPermissions();

  const downloadDocument = createCallback(async () => {
    try {
      const blob = await getBlob();
      downloadFile(blob, downloadName());
    } catch (e) {
      console.error('error downloading file', e);
      toast.failure('Error downloading file');
    }
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
            name={fileName()}
            ops={ops}
          />
        </div>
      </SplitToolbarLeft>
      <SplitToolbarRight>
        <div class="flex items-center p-1">
          <ReferencesModal
            documentId={blockId}
            documentName={fileName()}
            buttonSize="sm"
          />
          <div class="flex items-center">
            <SplitPermissionsBadge />
            <ShareButton
              id={blockId}
              name={fileName()}
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

export default function BlockUnknown() {
  return (
    <DocumentBlockContainer>
      <div class="w-full h-full bg-panel select-none overscroll-none overflow-hidden flex flex-col relative">
        <div class="relative">
          <UnknownTopBar />
        </div>
        <div class="w-full grow-1 relative overflow-hidden">
          <Unknown />
        </div>
      </div>
    </DocumentBlockContainer>
  );
}

const Unknown = () => {
  const documentId = useBlockId();
  const fileName = useBlockDocumentName();
  const downloadName = useBlockDocumentDownloadName();
  const [isSharePermOpen, setIsSharePermOpen] = createSignal(false);
  const getBlob = useGetFileBlob();

  const userPermissions = () => {
    const accessLevel = blockData()?.userAccessLevel;
    if (!accessLevel) return Permissions.NO_ACCESS;

    return getPermissions(accessLevel);
  };

  const downloadDocument = createCallback(async () => {
    try {
      const blob = await getBlob();
      downloadFile(blob, downloadName());
    } catch (e) {
      console.error('error downloading file', e);
      toast.failure('Error downloading file');
    }
  });

  return (
    <div class="h-full flex flex-col justify-center items-center">
      <div class="w-fit mx-4 p-4 flex flex-col justify-center items-center gap-4">
        <div class="text-lg text-center">
          No preview available for{' '}
          <span class="text-ink-muted">{fileName()}</span>
        </div>

        <div class="flex flex-row gap-2 items-center">
          <DeprecatedTextButton
            text="Share"
            theme="accent"
            icon={ShareFat}
            onClick={() => setIsSharePermOpen(true)}
          />

          <DeprecatedTextButton
            text="Download"
            theme="accent"
            icon={DownloadSimple}
            onClick={downloadDocument}
          />
        </div>
      </div>
      <ShareModal
        id={documentId}
        name={fileName()}
        userPermissions={userPermissions()}
        itemType="document"
        isSharePermOpen={isSharePermOpen()}
        setIsSharePermOpen={setIsSharePermOpen}
      />
    </div>
  );
};
