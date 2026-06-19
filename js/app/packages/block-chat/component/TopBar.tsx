import type { BlockTool } from '@app/component/ResponsiveBlockToolbar';
import {
  ResponsiveBlockToolbar,
  ResponsivePermissionsBadge,
} from '@app/component/ResponsiveBlockToolbar';
import { useDrawerControl } from '@app/component/split-layout/components/SplitDrawerContext';
import {
  type FileOperation,
  SplitFileMenu,
} from '@app/component/split-layout/components/SplitFileMenu';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import { BlockItemSplitLabel } from '@app/component/split-layout/components/SplitLabel';
import { useSplitPanel } from '@app/component/split-layout/layoutUtils';

import { DEFAULT_CHAT_NAME } from '@block-chat/definition';
import { useIsAuthenticated } from '@core/auth';
import { useBlockId } from '@core/block';
import { DETAILS_DRAWER_ID } from '@core/component/DetailsDrawer';
import {
  REFERENCES_DRAWER_ID,
  ReferencesButton,
} from '@core/component/ReferencesModal';
import {
  getShareDrawerRecipientInput,
  ShareTrigger,
  useShareDialogContext,
} from '@core/component/TopBar/ShareButton';
import {
  DEV_MODE_ENV,
  ENABLE_REFERENCES_MODAL,
} from '@core/constant/featureFlags';
import { isMobile } from '@core/mobile/isMobile';
import { useBlockDocumentName } from '@core/util/currentBlockDocumentName';
import IconShared from '@icon/wide-share.svg';
import ChatDebugIcon from '@phosphor/chat-text.svg';
import Info from '@phosphor/info.svg';
import Notepad from '@phosphor/notepad.svg';
import Quotes from '@phosphor/quotes.svg';
import { Button, cn } from '@ui';
import { Show } from 'solid-js';
import { useOpenInstructionsMd } from 'core/component/AI/util/instructions';
import { setShowChatStreamDebug, showChatStreamDebug } from '../signal/debug';

export function TopBar() {
  const isAuth = useIsAuthenticated();
  const blockId = useBlockId();

  const name = useBlockDocumentName(DEFAULT_CHAT_NAME);
  const chatName = () => name();

  const openInstructions = useOpenInstructionsMd();

  const referencesControl = useDrawerControl(REFERENCES_DRAWER_ID);
  const detailsControl = useDrawerControl(DETAILS_DRAWER_ID);
  const shareCtx = useShareDialogContext();
  const splitPanel = useSplitPanel();
  const compactHeader = () => (splitPanel?.panelSize.width ?? Infinity) < 440;

  const ops: FileOperation[] = [
    { op: 'rename' },
    { op: 'copy' },
    { op: 'moveToProject' },
    { op: 'delete' },
  ];

  const headerMenuTools: BlockTool[] = [
    {
      label: 'Edit AI Instructions',
      icon: Notepad,
      action: openInstructions,
      condition: () => !isMobile(),
      menuGroup: 'file',
    },
    {
      label: () =>
        showChatStreamDebug() ? 'Hide Stream Debug' : 'Show Stream Debug',
      icon: ChatDebugIcon,
      action: () => setShowChatStreamDebug((show) => !show),
      condition: () => DEV_MODE_ENV,
      menuGroup: 'file',
    },
    {
      label: 'Share',
      icon: IconShared,
      action: () => shareCtx.open(),
      condition: () => !isMobile() && compactHeader(),
      focusTarget: getShareDrawerRecipientInput,
      menuGroup: 'share',
    },
    {
      label: 'References',
      icon: Quotes,
      action: referencesControl.toggle,
      condition: () =>
        !isMobile() && compactHeader() && !!isAuth() && ENABLE_REFERENCES_MODAL,
      menuGroup: 'copy',
    },
    {
      label: 'Details',
      icon: Info,
      action: detailsControl.toggle,
      condition: () => !isMobile() && compactHeader(),
      menuGroup: 'copy',
    },
  ];

  const tools: BlockTool[] = [
    {
      label: 'Edit AI Instructions',
      icon: Notepad,
      action: openInstructions,
      condition: isMobile,
    },
    {
      label: 'References',
      icon: Quotes,
      action: referencesControl.toggle,
      condition: () => isMobile() && !!isAuth() && ENABLE_REFERENCES_MODAL,
      buttonComponent: () => (
        <ReferencesButton
          documentId={blockId}
          documentName={chatName()}
          buttonSize="sm"
          entityType="chat"
        />
      ),
    },
    {
      label: 'Share',
      icon: IconShared,
      action: () => shareCtx.open(),
      condition: isMobile,
      buttonComponent: () => <ShareTrigger />,
      focusTarget: getShareDrawerRecipientInput,
    },
  ];

  return (
    <>
      <SplitHeaderLeft>
        <div class="flex min-w-0 flex-1 flex-col justify-center">
          <div class="flex min-w-0 flex-1 items-center">
            <div class="min-w-0 overflow-hidden">
              <BlockItemSplitLabel
                fallbackName={DEFAULT_CHAT_NAME}
                lockRename={false}
              />
            </div>
            <Show when={!isMobile() && ops.length > 0}>
              <SplitFileMenu
                id={blockId}
                itemType="chat"
                name={chatName()}
                ops={ops}
                tools={headerMenuTools}
                buttonClass="ml-1 size-6 p-1 shrink-0 text-ink-extra-muted hover:text-ink [&_svg]:size-3.5"
              />
            </Show>
          </div>
        </div>
      </SplitHeaderLeft>
      <SplitHeaderRight>
        <Show when={!isMobile() && !compactHeader()}>
          <ShareTrigger />
          <Show when={!!isAuth() && ENABLE_REFERENCES_MODAL}>
            <Button
              depth={2}
              variant="base"
              size="icon-sm"
              class={cn('ml-1.5 size-6 p-1 bg-surface [&_svg]:size-3.5', {
                'bg-active text-ink': referencesControl.isOpen(),
              })}
              tooltip={
                referencesControl.isOpen() ? 'Hide References' : 'Show References'
              }
              onClick={referencesControl.toggle}
            >
              <Quotes />
            </Button>
          </Show>
          <Button
            depth={2}
            variant="base"
            size="icon-sm"
            class={cn('ml-1.5 size-6 p-1 bg-surface [&_svg]:size-3.5', {
              'bg-active text-ink': detailsControl.isOpen(),
            })}
            tooltip={detailsControl.isOpen() ? 'Hide Details' : 'Show Details'}
            onClick={detailsControl.toggle}
          >
            <Info />
          </Button>
        </Show>
      </SplitHeaderRight>
      <ResponsivePermissionsBadge />
      <ResponsiveBlockToolbar
        tools={tools}
        ops={isMobile() ? ops : []}
        id={blockId}
        itemType="chat"
        name={chatName()}
      />
    </>
  );
}
