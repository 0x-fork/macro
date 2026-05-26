import { Popover } from '@kobalte/core/popover';
import { Button } from '@ui';
import { UserIcon } from '@core/component/UserIcon';
import { idToEmail } from '@core/user';
import { useSplitLayout } from '@app/component/split-layout/layout';
import { commsServiceClient } from '@service-comms/client';
import { For, Show, type JSX } from 'solid-js';
import type { ChannelParticipant } from '@queries/channel/types';
import UsersIcon from '@phosphor/users.svg';

export function ChannelParticipantsPopover(props: {
  participants: ChannelParticipant[];
  trigger?: JSX.Element;
}) {
  const { replaceOrInsertSplit } = useSplitLayout();

  const openDirectMessage = async (participantId: string) => {
    const result = await commsServiceClient.getOrCreateDirectMessage({
      recipient_id: participantId,
    });
    if (result.isErr()) return;
    const channelId = result.value.channel_id;

    if (channelId) {
      replaceOrInsertSplit({
        type: 'channel',
        id: channelId,
      });
    }
  };

  return (
    <Popover>
      <Popover.Trigger
        as={Button}
        size="icon-sm"
        class="rounded-md"
      >
        <Show when={props.trigger} fallback={<UsersIcon class="size-4" />}>
          {props.trigger}
        </Show>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class="z-50 bg-menu border border-edge rounded-lg shadow-lg p-2 min-w-48 max-w-64 max-h-80 overflow-y-auto">
          <div class="text-xs font-medium text-ink-muted px-2 py-1 mb-1">
            {props.participants.length} participants
          </div>
          <For each={props.participants}>
            {(participant) => (
              <button
                type="button"
                class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-hover text-left"
                onClick={() => openDirectMessage(participant.user_id)}
              >
                <UserIcon id={participant.user_id} size="sm" />
                <span class="text-sm truncate flex-1">
                  {idToEmail(participant.user_id)}
                </span>
              </button>
            )}
          </For>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
