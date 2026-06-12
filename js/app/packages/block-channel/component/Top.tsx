import { SplitHeaderLeft } from '@app/component/split-layout/components/SplitHeader';
import { SplitLabel } from '@app/component/split-layout/components/SplitLabel';
import { useBlockId } from '@core/block';
import { UserIcon } from '@core/component/UserIcon';
import { useChannelName } from '@core/context/channels';
import { useUserId } from '@core/context/user';
import HashIcon from '@phosphor/hash.svg';
import type { ChannelParticipant } from '@queries/channel/types';
import { ChannelTypeEnum } from '@service-storage/client';
import type { ChannelType } from '@service-storage/generated/schemas/channelType';
import { type JSX, Show } from 'solid-js';

type TopIconProps = {
  channelType: ChannelType;
  participants: ChannelParticipant[];
};

function TopIcon(props: TopIconProps) {
  const userId = useUserId();
  const recipient = () => {
    return props.participants.find((p) => p && p.user_id !== userId());
  };

  return (
    <Show
      when={props.channelType === ChannelTypeEnum.DirectMessage && recipient()}
      fallback={<HashIcon class="size-4 shrink-0 text-ink-extra-muted" />}
    >
      {(recipient) => {
        return (
          <UserIcon id={recipient().user_id} isDeleted={false} size="sm" />
        );
      }}
    </Show>
  );
}

type TopProps = {
  channelType: ChannelType;
  participants: ChannelParticipant[];
  channelName: string;
  channelId: string;
};

type ChannelTopLeftProps = TopProps & {
  lockRename?: boolean;
  trackingIndicator?: JSX.Element;
  callButton?: JSX.Element;
};

export function ChannelTopLeft(props: ChannelTopLeftProps) {
  const blockId = useBlockId();
  const channelName = useChannelName(
    blockId,
    props.channelName ?? 'New Channel'
  );

  return (
    <SplitHeaderLeft>
      <div class="ph-no-capture z-page-overlay relative flex items-center gap-1 max-w-full h-full shrink min-w-15">
        <TopIcon
          channelType={props.channelType}
          participants={props.participants}
        />
        <SplitLabel
          label={channelName() ?? 'New Channel'}
          lockRename={props.lockRename}
          renameOverrides={{ channelType: props.channelType }}
          maxDisplayLength={48}
        />
        <Show when={props.trackingIndicator}>
          <div class="text-ink">{props.trackingIndicator}</div>
        </Show>
        <Show when={props.callButton}>{props.callButton}</Show>
      </div>
    </SplitHeaderLeft>
  );
}
