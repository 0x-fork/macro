import { openChatWithAgent } from '@app/component/ChatWithAgentButton';
import { useSidePanel } from '@app/component/side-panel';
import { useSplitLayout } from '@app/component/split-layout/layout';
import { useSplitPanel } from '@app/component/split-layout/layoutUtils';
import { SplitFileMenu } from '@app/component/split-layout/components/SplitFileMenu';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import { StaticSplitLabel } from '@app/component/split-layout/components/SplitLabel';
import { useBlockId } from '@core/block';
import { useUserId } from '@core/context/user';
import { BlockLiveIndicators } from '@core/component/LiveIndicators';
import { toast } from '@core/component/Toast/Toast';
import {
  getShareDrawerRecipientInput,
  ShareTrigger,
  useShareDialogContext,
} from '@core/component/TopBar/ShareButton';
import {
  useCanComment,
  useCanEdit,
  useCanView,
} from '@core/signal/permissions';
import { buildSimpleEntityUrl } from '@core/util/url';
import MacroLogo from '@icon/macro-logo.svg';
import PhoneCallIcon from '@icon/wide-call.svg';
import IconShared from '@icon/wide-share.svg';
import { useGetOrCreateDirectMessageMutation } from '@queries/channel/get-or-create-dm';
import IdIcon from '@phosphor/identification-card.svg';
import EyeIcon from '@phosphor/eye.svg';
import LinkIcon from '@phosphor/link.svg';
import ChatIcon from '@phosphor/chat-circle.svg';
import SidePanelIcon from '@phosphor/square-half.svg';
import type { CallRecord } from '@service-storage/generated/schemas/callRecord';
import { Button, cn } from '@ui';
import type { Accessor } from 'solid-js';
import { Show } from 'solid-js';

function PermissionPill() {
  const canEdit = useCanEdit();
  const canComment = useCanComment();
  const canView = useCanView();

  const show = () => !canEdit();
  const text = () => {
    if (!canView()) return 'No access';
    if (canComment()) return 'Comment only';
    return 'Viewer';
  };

  return (
    <Show when={show()}>
      <span class="inline-flex h-6 items-center gap-1.5 rounded-full bg-ink/3 px-2 text-xs font-medium text-ink/65">
        <EyeIcon class="size-3.5 shrink-0" />
        <span>{text()}</span>
      </span>
    </Show>
  );
}

export function CallRecordingSplitHeaderLoading() {
  return (
    <SplitHeaderLeft>
      <StaticSplitLabel
        label="Call Recording"
        icon={<PhoneCallIcon class="size-4 shrink-0 text-ink-extra-muted" />}
      />
    </SplitHeaderLeft>
  );
}

export function CallRecordingActionsBar(props: {
  record: Accessor<CallRecord>;
}) {
  const record = props.record;
  const blockId = useBlockId();
  const callName = () => record().customName ?? record().channelName ?? 'Call';

  return (
    <div class="mb-2 flex items-center gap-1.5">
      <Button
        variant="base"
        depth={1}
        size="sm"
        noTouchResize
        class="ask-macro-button group h-6 rounded-full border-transparent bg-ink/3 px-2 py-0 text-xs font-medium gap-1.5 text-ink/65 hover:bg-ink/6 hover:text-ink"
        onClick={() =>
          openChatWithAgent({
            type: 'document',
            id: blockId,
            name: callName(),
            fileType: 'call',
          })
        }
      >
        <MacroLogo class="ask-macro-logo-shimmer size-3.5 shrink-0" />
        <span>Ask Macro</span>
      </Button>
      <PermissionPill />
    </div>
  );
}

export function CallRecordingSplitHeader(props: {
  record: Accessor<CallRecord>;
}) {
  const record = props.record;
  const blockId = useBlockId();
  const shareCtx = useShareDialogContext();
  const sidePanel = useSidePanel();
  const splitPanel = useSplitPanel();
  const { openWithSplit } = useSplitLayout();
  const currentUserId = useUserId();
  const getOrCreateDm = useGetOrCreateDirectMessageMutation({
    onSuccess: ({ channel_id }) => {
      openWithSplit(
        { type: 'channel', id: channel_id },
        { referredFrom: 'kommand-menu' }
      );
    },
  });
  const callName = () => record().customName ?? record().channelName ?? 'Call';
  const compactHeader = () => (splitPanel?.panelSize.width ?? Infinity) < 440;

  const copyId = () => {
    void navigator.clipboard.writeText(blockId);
    toast.success('Copied call ID');
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(
      buildSimpleEntityUrl({ type: 'call', id: blockId })
    );
    toast.success('Copied link');
  };

  const messageChannel = () => {
    const participants = record().participants;
    const currentUser = currentUserId();
    const otherParticipant = participants.find(
      (participant) => participant.userId !== currentUser
    );

    // One-on-one calls can be backed by ephemeral/legacy call channels that are
    // not the same as the durable DM thread users expect to message in. Resolve
    // the DM explicitly when there is a single other participant.
    if (otherParticipant && participants.length <= 2) {
      getOrCreateDm.mutate({ recipient_id: otherParticipant.userId });
      return;
    }

    const channelId = record().channelId;
    if (!channelId) return;
    openWithSplit(
      { type: 'channel', id: channelId },
      { referredFrom: 'kommand-menu' }
    );
  };

  const headerMenuOps = [
    {
      label: 'Message channel',
      icon: ChatIcon,
      action: messageChannel,
      group: 'file' as const,
    },
    { op: 'copy' as const },
    {
      label: 'Copy Link',
      icon: LinkIcon,
      action: copyLink,
      group: 'delete' as const,
      destructive: false,
    },
    {
      label: 'Copy ID',
      icon: IdIcon,
      action: copyId,
      group: 'delete' as const,
      destructive: false,
    },
  ];

  const headerMenuTools = [
    {
      label: 'Share',
      icon: IconShared,
      action: () => shareCtx.open(),
      condition: compactHeader,
      focusTarget: getShareDrawerRecipientInput,
      menuGroup: 'share' as const,
    },
  ];

  return (
    <>
      <SplitHeaderLeft>
        <div class="flex min-w-0 items-center">
          <div class="min-w-0 overflow-hidden">
            <StaticSplitLabel
              label={callName()}
              icon={
                <PhoneCallIcon class="size-4 shrink-0 text-ink-extra-muted" />
              }
            />
          </div>
          <SplitFileMenu
            id={blockId}
            itemType="call"
            name={callName()}
            ops={headerMenuOps}
            tools={headerMenuTools}
            buttonClass="ml-1 size-6 p-1 shrink-0 text-ink-extra-muted hover:text-ink [&_svg]:size-3.5"
          />
        </div>
      </SplitHeaderLeft>

      <SplitHeaderRight>
        <div class="-order-1">
          <BlockLiveIndicators />
        </div>
        <Show when={!compactHeader()}>
          <ShareTrigger />
        </Show>
        <Show when={sidePanel && sidePanel.hasSections() ? sidePanel : undefined}>
          {(panel) => (
            <Button
              depth={2}
              variant="base"
              size="icon-sm"
              class={cn('ml-1.5 size-6 p-1 bg-surface [&_svg]:size-3.5', {
                'bg-active text-ink': panel().isOpen(),
              })}
              tooltip="View details"
              onClick={() => panel().toggle()}
            >
              <SidePanelIcon />
            </Button>
          )}
        </Show>
      </SplitHeaderRight>
    </>
  );
}
