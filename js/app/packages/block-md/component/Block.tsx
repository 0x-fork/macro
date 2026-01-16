import { useGlobalNotificationSource } from '@app/component/GlobalAppState';
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
import { withAnalytics } from '@coparse/analytics';
import { useBlockId } from '@core/block';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { DeprecatedIconButton } from '@core/component/DeprecatedIconButton';
import { DocumentBlockContainer } from '@core/component/DocumentBlockContainer';
import { HistoryModal } from '@core/component/HistoryModal';
import { BlockLiveIndicators } from '@core/component/LiveIndicators';
import { NotificationsModal } from '@core/component/NotificationsModal';
import { ReferencesModal } from '@core/component/ReferencesModal';
import { ShareButton } from '@core/component/TopBar/ShareButton';
import {
  ENABLE_NOTE_COMMENTS,
  ENABLE_REFERENCES_MODAL,
} from '@core/constant/featureFlags';
import {
  blockFileSignal,
  blockHandleSignal,
  blockMetadataSignal,
} from '@core/signal/load';
import { useGetPermissions } from '@core/signal/permissions';
import {
  useBlockDocumentDownloadName,
  useBlockDocumentName,
} from '@core/util/currentBlockDocumentName';
import { downloadFile } from '@filesystem/download';
import ChatCircle from '@icon/regular/chat-circle.svg';
import DownloadSimple from '@icon/regular/download-simple.svg';
import { createCallback } from '@solid-primitives/rootless';
import { DocumentDebouncedNotificationReadMarker } from '@notifications';
import { useInstructionsMdIdQuery } from '@service-storage/instructionsMd';
import { createEffect, createSignal, onMount, Show, Suspense } from 'solid-js';
import { mdStore } from '../signal/markdownBlockData';
import { MarkdownPropertiesModal } from './MarkdownPropertiesModal';
import { FindAndReplace } from './FindAndReplace';
import { InstructionsNotebook, Notebook } from './Notebook';

const { track, TrackingEvents } = withAnalytics();

function MarkdownTopBar() {
  const documentId = useBlockId();
  const documentFile = blockFileSignal.get;
  const name = useBlockDocumentName();
  const downloadName = useBlockDocumentDownloadName();
  const userPermissions = useGetPermissions();
  const notificationSource = useGlobalNotificationSource();
  const { commentsOpen, setCommentsOpen } = mdStore.get;
  const blockHandle = blockHandleSignal.get;

  const downloadDocument = createCallback(async () => {
    const file = documentFile();
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
      icon: DownloadSimple,
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
      <SplitHeaderRight>
        <BlockLiveIndicators />
      </SplitHeaderRight>
      <SplitToolbarLeft>
        <div class="p-1">
          <SplitFileMenu
            id={documentId}
            itemType="document"
            name={name()}
            ops={ops}
          />
        </div>
      </SplitToolbarLeft>
      <SplitToolbarRight>
        <div class="flex items-center p-1">
          <HistoryModal
            buttonSize="sm"
            blockHandle={blockHandle}
            itemType="document"
          />
          <NotificationsModal
            entity={{ id: documentId, type: 'document' }}
            notificationSource={notificationSource}
            buttonSize="sm"
          />
          <Show when={ENABLE_NOTE_COMMENTS}>
            <DeprecatedIconButton
              icon={ChatCircle}
              size="sm"
              theme="clear"
              onClick={() => setCommentsOpen(!commentsOpen())}
              tooltip={{ label: commentsOpen() ? 'Hide comments' : 'Show comments' }}
              active={commentsOpen()}
            />
          </Show>
          <Show when={ENABLE_REFERENCES_MODAL}>
            <ReferencesModal
              documentId={documentId}
              documentName={name()}
              buttonSize="sm"
            />
          </Show>
          <MarkdownPropertiesModal
            documentId={documentId}
            blockType="markdown"
            buttonSize="sm"
          />
          <div class="flex items-center">
            <SplitPermissionsBadge />
            <ShareButton
              id={documentId}
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

function InstructionsTopBar() {
  return (
    <>
      <SplitHeaderLeft>
        <BlockItemSplitLabel fallbackName="AI Instructions" />
      </SplitHeaderLeft>
    </>
  );
}

export default function BlockMarkdown() {
  const [scrollRef, setScrollRef] = createSignal<HTMLDivElement>();
  const blockId = useBlockId();
  const instructionsMdId = useInstructionsMdIdQuery();
  const notificationSource = useGlobalNotificationSource();
  const isInstructionsMd = () => {
    return blockId === instructionsMdId.data;
  };

  // Set initial data.
  onMount(() => {
    track(TrackingEvents.BLOCKMARKDOWN.OPEN);
  });

  createEffect(() => {
    const el = scrollRef();
    if (el) {
      mdStore.set({ scrollContainer: el });
    }
  });

  return (
    <DocumentBlockContainer>
      <div
        class="w-full h-full select-none overscroll-none overflow-hidden flex flex-col relative bracket-never"
        tabIndex={-1}
      >
        <div class="relative">
          <Suspense>
            <Show when={!isInstructionsMd()} fallback={<InstructionsTopBar />}>
              <MarkdownTopBar />
            </Show>
          </Suspense>
          {/* off until - https://linear.app/macro-eng/issue/M-5203/markdown-unloads-completely-after-find */}
          <Suspense>
            <Show when={!isInstructionsMd() && false}>
              <div class="absolute right-4 bottom-[-12] translate-y-full z-action-menu flex justify-end">
                <FindAndReplace />
              </div>
            </Show>
          </Suspense>
        </div>
        <DocumentDebouncedNotificationReadMarker
          notificationSource={notificationSource}
          documentId={blockId}
        />
        <div class="w-full grow overflow-hidden relative" data-block-content>
          <div
            class="w-full h-full relative overflow-auto portal-scope scrollbar-hidden"
            ref={setScrollRef}
          >
            <Suspense>
              <Show
                when={!isInstructionsMd()}
                fallback={<InstructionsNotebook />}
              >
                <Notebook />
              </Show>
            </Suspense>
          </div>
          <CustomScrollbar scrollContainer={scrollRef} />
        </div>
      </div>
    </DocumentBlockContainer>
  );
}
