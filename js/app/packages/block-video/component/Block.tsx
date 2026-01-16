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
import { blockMetadataSignal } from '@core/signal/load';
import { useGetPermissions } from '@core/signal/permissions';
import {
  useBlockDocumentDownloadName,
  useBlockDocumentName,
} from '@core/util/currentBlockDocumentName';
import { downloadFile } from '@filesystem/download';
import Download from '@icon/regular/download.svg';
import { createCallback } from '@solid-primitives/rootless';
import { toast } from 'core/component/Toast/Toast';
import { createEffect, createSignal, Show } from 'solid-js';
import { blockData, useGetFileBlob } from '../signal/blockData';

const { track, TrackingEvents } = withAnalytics();

function VideoTopBar() {
  const blockId = useBlockId();
  const name = useBlockDocumentName();
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

export default function BlockVideo() {
  return (
    <DocumentBlockContainer>
      <div class="w-full h-full bg-panel select-none overscroll-none overflow-hidden flex flex-col relative">
        <div class="relative">
          <VideoTopBar />
        </div>
        <div class="w-full grow-1 relative overflow-hidden">
          <Video />
        </div>
      </div>
    </DocumentBlockContainer>
  );
}

const Video = () => {
  const videoUrl = () => blockData()?.videoUrl;
  const [playbackError, setPlaybackError] = createSignal<string>();

  createEffect(() => {
    const err = playbackError();
    if (err) {
      toast.failure(err);
    }
  });

  return (
    <div class="w-full h-full flex flex-col items-center justify-center gap-3 text-ink">
      <Show when={videoUrl()}>
        <video
          class="w-full h-full"
          controls
          autoplay
          src={videoUrl()}
          onError={(e) => {
            console.error('video error', e);
            track(TrackingEvents.BLOCKVIDEO.PLAYBACK.ERROR, { error: e });
            setPlaybackError('Video playback failed');
          }}
        />
      </Show>
    </div>
  );
};
