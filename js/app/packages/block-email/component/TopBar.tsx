import { useMaybeSoup } from '@app/component/next-soup/soup-context';
import { trashEmails } from '@app/component/next-soup/utils';
import type { BlockTool } from '@app/component/ResponsiveBlockToolbar';
import {
  type FileOperation,
  SplitFileMenu,
} from '@app/component/split-layout/components/SplitFileMenu';
import { ResponsiveBlockToolbar } from '@app/component/ResponsiveBlockToolbar';
import { useSidePanel } from '@app/component/side-panel';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import {
  SplitHeaderBadge,
  StaticSplitLabel,
} from '@app/component/split-layout/components/SplitLabel';
import { useSplitLayout } from '@app/component/split-layout/layout';
import { useSplitPanel } from '@app/component/split-layout/layoutUtils';
import {
  getShareDrawerRecipientInput,
  ShareTrigger,
  useShareDialogContext,
} from '@core/component/TopBar/ShareButton';
import { toast } from '@core/component/Toast/Toast';
import { ENABLE_EMAIL_SHARING } from '@core/constant/featureFlags';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { isMobile } from '@core/mobile/isMobile';
import { buildSimpleEntityUrl } from '@core/util/url';
import IconShared from '@icon/wide-share.svg';
import { AnimatedTaskIcon } from '@icon/wide-task';
import ArrowCounterClockwise from '@phosphor-icons/core/regular/arrow-counter-clockwise.svg?component-solid';
import CheckIcon from '@phosphor/check.svg';
import { buildMentionMarkdownString } from '@lexical-core';
import LinkIcon from '@phosphor/link.svg';
import ProhibitIcon from '@phosphor/prohibit.svg';
import SidePanelIcon from '@phosphor/square-half.svg';
import TrashIcon from '@phosphor/trash.svg';
import { useEmailLinksQuery } from '@queries/email/link';
import { Button, cn } from '@ui';
import { createMemo, onCleanup, Show } from 'solid-js';
import { useEmailContext } from './EmailContext';

export function TopBar(props: {
  id: string;
  title: string;
  isDraft?: boolean;
}) {
  const { popoverSplit } = useSplitLayout();
  const splitPanel = useSplitPanel();
  const shareCtx = useShareDialogContext();
  const emailCtx = useEmailContext();
  const soup = useMaybeSoup();
  const linksQuery = useEmailLinksQuery();
  const sidePanel = useSidePanel();
  const compactHeader = () => (splitPanel?.panelSize.width ?? Infinity) < 440;

  if (splitPanel?.splitHotkeyScope) {
    const reg = registerHotkey({
      hotkey: ']',
      scopeId: splitPanel.splitHotkeyScope,
      hotkeyToken: TOKENS.block.toggleSidePanel,
      description: 'Toggle Side Panel',
      keyDownHandler: () => {
        if (!sidePanel) return false;
        if (!sidePanel.hasSections()) return false;
        sidePanel.toggle();
        return true;
      },
    });
    onCleanup(() => reg.dispose());
  }

  const isInvite = () => {
    const row = soup?.items.get(props.id);
    const entity = row?.original;
    return entity?.type === 'email' && entity.hasIcsAttachment === true;
  };

  const isOwnThread = () => {
    const thread = emailCtx.thread();
    const links = linksQuery.data?.links;
    if (!thread || !links) return false;
    return links.some((link) => link.id === thread.link_id);
  };

  const markDone = () => {
    emailCtx.archiveThread();
  };

  const moveToTrash = () => {
    const threadId = emailCtx.thread()?.db_id;
    if (!threadId) return;

    const handle = trashEmails([threadId]);
    const toastId = toast.success('Moved to Trash', {
      actions: [
        {
          label: 'Undo',
          icon: ArrowCounterClockwise,
          onClick: () => {
            if (toastId != null) toast.dismiss(toastId);
            handle.undo().then(
              () => toast.success('Restored from Trash'),
              () => toast.failure('Failed to restore from Trash')
            );
          },
        },
      ],
      duration: 10_000,
    });

    handle.done.catch(() => {
      toast.failure('Failed to move to Trash');
    });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(
      buildSimpleEntityUrl({ type: 'email', id: props.id })
    );
    toast.success('Link copied to clipboard.');
  };

  const openTaskCompose = () => {
    const threadId = emailCtx.thread()?.db_id;
    if (!threadId) return;
    const title =
      props.title.length > 70 ? `${props.title.slice(0, 70)}...` : props.title;
    popoverSplit({
      type: 'component',
      id: 'task-compose',
      params: {
        initialTitle: title,
        initialContent: buildMentionMarkdownString({
          type: 'document',
          documentId: threadId,
          documentName: props.title,
          blockName: 'email',
        }),
      },
    });
  };

  const moreMenuOps = createMemo<FileOperation[]>(() => [
    {
      label: 'Create Task',
      icon: AnimatedTaskIcon,
      action: openTaskCompose,
      group: 'file',
    },
    ...(isOwnThread()
      ? ([
          {
            label: 'Mark done',
            icon: CheckIcon,
            action: markDone,
            group: 'delete' as const,
            destructive: false,
          },
          {
            label: 'Block Sender',
            icon: ProhibitIcon,
            action: () => emailCtx.blockSender(),
            group: 'delete' as const,
          },
          {
            label: 'Move to Trash',
            icon: TrashIcon,
            action: moveToTrash,
            group: 'delete' as const,
          },
        ] satisfies FileOperation[])
      : []),
  ]);

  const moreMenuTools = createMemo<BlockTool[]>(() => [
    {
      label: 'Share',
      icon: IconShared,
      action: () => shareCtx.open(),
      condition: () => ENABLE_EMAIL_SHARING && compactHeader(),
      focusTarget: getShareDrawerRecipientInput,
      menuGroup: 'share',
    },
    {
      label: 'Copy link',
      icon: LinkIcon,
      action: copyLink,
      menuGroup: 'share',
    },
    {
      label: 'View details',
      icon: SidePanelIcon,
      action: () => sidePanel?.setIsOpen(true),
      condition: () =>
        compactHeader() &&
        (sidePanel?.hasSections() ?? false) &&
        !(sidePanel?.isOpen() ?? false),
      menuGroup: 'copy',
    },
  ]);

  const tools: BlockTool[] = [];

  return (
    <>
      <SplitHeaderLeft>
        <div class="flex min-w-0 flex-1 items-center">
          <div class="min-w-0 overflow-hidden">
            <StaticSplitLabel
              class="ph-no-capture"
              iconType={isInvite() ? 'emailInvite' : 'email'}
              colorIcon={isInvite()}
              label={isMobile() ? '' : props.title}
              badges={
                props.isDraft
                  ? [
                      <SplitHeaderBadge
                        text="draft"
                        tooltip="This is a Draft Email"
                      />,
                    ]
                  : undefined
              }
            />
          </div>
          <Show when={!isMobile()}>
            <SplitFileMenu
              id={props.id}
              itemType="email"
              name={props.title}
              ops={moreMenuOps()}
              tools={moreMenuTools()}
              buttonClass="ml-1 size-6 p-1 shrink-0 text-ink-extra-muted hover:text-ink [&_svg]:size-3.5"
            />
          </Show>
        </div>
      </SplitHeaderLeft>

      <SplitHeaderRight>
        <Show when={!isMobile() && !compactHeader() && ENABLE_EMAIL_SHARING}>
          <ShareTrigger />
        </Show>
        <Show
          when={
            sidePanel && !compactHeader() && (sidePanel.hasSections() ?? false)
              ? sidePanel
              : undefined
          }
        >
          {(panel) => (
            <Button
              depth={2}
              variant="base"
              size="icon-sm"
              class={cn('ml-1.5 size-6 p-1 bg-surface [&_svg]:size-3.5', {
                'bg-active text-ink': panel().isOpen(),
              })}
              tooltip="View details"
              hotkey={TOKENS.block.toggleSidePanel}
              onClick={() => {
                panel().toggle();
              }}
            >
              <SidePanelIcon />
            </Button>
          )}
        </Show>
      </SplitHeaderRight>

      <ResponsiveBlockToolbar
        tools={tools}
        ops={[]}
        id={props.id}
        itemType="email"
        name={props.title}
      />
    </>
  );
}
