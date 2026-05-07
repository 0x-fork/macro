import { Popover } from '@kobalte/core/popover';
import { UserIcon } from '@core/component/UserIcon';
import { Tooltip } from '@core/component/Tooltip';
import { idToEmail } from '@core/user';
import { useSplitLayout } from '@app/component/split-layout/layout';
import { commsServiceClient } from '@service-comms/client';
import { isOk } from '@core/util/maybeResult';
import { createMemo, createSignal, For, Show } from 'solid-js';
import type { ChannelParticipant } from '@queries/channel/types';
import { useUserId } from '@core/context/user';
import { ENABLE_LIVE_INDICATORS } from '@core/constant/featureFlags';
import { Layer } from '@ui';
import { cn } from '@ui/utils/classname';
import UsersIcon from '@icon/regular/users.svg';

const MAX_USER_INDICATORS = 3;

function UserIndicator(props: { userId: string }) {
  return (
    <Tooltip tooltip={idToEmail(props.userId).split('@')[0]}>
      <div class="bg-panel size-6 rounded-full p-[2px] -mr-3">
        <UserIcon id={props.userId} isDeleted={false} size="fill" />
      </div>
    </Tooltip>
  );
}

function ParticipantRow(props: {
  participant: ChannelParticipant;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-hover text-left"
      onClick={props.onClick}
    >
      <div class="relative">
        <UserIcon id={props.participant.user_id} size="sm" />
        <Show when={props.isActive}>
          <div class="absolute -bottom-0.5 -right-0.5 size-2.5 bg-green-500 rounded-full border-2 border-menu" />
        </Show>
      </div>
      <span class="text-sm truncate flex-1">
        {idToEmail(props.participant.user_id)}
      </span>
    </button>
  );
}

export function ChannelParticipantsIndicator(props: {
  participants: ChannelParticipant[];
  activeUserIds: string[];
}) {
  const currentUserId = useUserId();
  const { replaceOrInsertSplit } = useSplitLayout();

  const activeUserIdsExcludingSelf = createMemo(() =>
    props.activeUserIds.filter((id) => id !== currentUserId())
  );

  const hasActiveUsers = () => activeUserIdsExcludingSelf().length > 0;

  const activeParticipants = createMemo(() =>
    props.participants.filter((p) =>
      activeUserIdsExcludingSelf().includes(p.user_id)
    )
  );

  const otherParticipants = createMemo(() =>
    props.participants.filter(
      (p) => !activeUserIdsExcludingSelf().includes(p.user_id)
    )
  );

  const remaining = createMemo(() => {
    const count = activeUserIdsExcludingSelf().length;
    if (count <= MAX_USER_INDICATORS) return undefined;
    return count - MAX_USER_INDICATORS;
  });

  const openDirectMessage = async (participantId: string) => {
    const result = await commsServiceClient.getOrCreateDirectMessage({
      recipient_id: participantId,
    });
    const channelId = isOk(result) && result[1]?.channel_id;

    if (channelId) {
      replaceOrInsertSplit({
        type: 'channel',
        id: channelId,
      });
    }
  };

  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <Popover open={isOpen()} onOpenChange={setIsOpen}>
      <Popover.Trigger class="flex items-center cursor-pointer">
        <Show
          when={ENABLE_LIVE_INDICATORS && hasActiveUsers()}
          fallback={
            <div class={cn(
              "size-7 flex items-center justify-center rounded-md hover:bg-hover",
              isOpen() && "bg-ink/10"
            )}>
              <UsersIcon class="size-4 text-ink-muted" />
            </div>
          }
        >
          <div class={cn(
            "flex items-center h-full shrink-0 overflow-hidden w-fit isolate pl-2 pr-4 rounded-md",
            isOpen() && "bg-ink/10"
          )}>
            <For each={activeUserIdsExcludingSelf().slice(0, MAX_USER_INDICATORS)}>
              {(userId) => <UserIndicator userId={userId} />}
            </For>
            <Show when={remaining()}>
              <div class="z-placeable">
                <Tooltip
                  tooltip={activeUserIdsExcludingSelf()
                    .slice(MAX_USER_INDICATORS)
                    .map((user) => idToEmail(user).split('@')[0])
                    .join(', ')}
                >
                  <div class="size-6 bg-menu border-2 text-xxs -mr-3 border-panel rounded-full flex flex-col justify-center items-center">
                    <span>{`+${remaining()}`}</span>
                  </div>
                </Tooltip>
              </div>
            </Show>
          </div>
        </Show>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class="z-50 min-w-56 max-w-72 max-h-96 flex flex-col">
          <Layer depth={3}>
            <div class="bg-panel rounded-lg ring-1 ring-edge-muted shadow-md flex flex-col max-h-96">
              <div class="text-sm font-medium text-ink px-4 py-3 shrink-0">
                Participants
              </div>
              <div class="overflow-y-auto px-4 pb-4 flex-1">
                <Show when={activeParticipants().length > 0}>
                  <div class="text-xs font-medium text-ink-muted px-2 py-1">
                    Active
                  </div>
                  <For each={activeParticipants()}>
                    {(participant) => (
                      <ParticipantRow
                        participant={participant}
                        isActive
                        onClick={() => openDirectMessage(participant.user_id)}
                      />
                    )}
                  </For>
                </Show>
                <Show when={otherParticipants().length > 0}>
                  <Show when={activeParticipants().length > 0}>
                    <div class="text-xs font-medium text-ink-muted px-2 py-1 mt-2">
                      Members
                    </div>
                  </Show>
                  <For each={otherParticipants()}>
                    {(participant) => (
                      <ParticipantRow
                        participant={participant}
                        onClick={() => openDirectMessage(participant.user_id)}
                      />
                    )}
                  </For>
                </Show>
              </div>
            </div>
          </Layer>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
