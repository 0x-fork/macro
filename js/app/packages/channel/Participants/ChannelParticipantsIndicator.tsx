import { Popover } from '@kobalte/core/popover';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import { UserIcon } from '@core/component/UserIcon';
import { Tooltip } from '@core/component/Tooltip';
import { idToEmail } from '@core/user';
import { useSplitLayout } from '@app/component/split-layout/layout';
import { commsServiceClient } from '@service-comms/client';
import { ChannelType } from '@service-comms/generated/models/channelType';
import { isOk } from '@core/util/maybeResult';
import { createMemo, createSignal, For, Show } from 'solid-js';
import type { ChannelParticipant } from '@queries/channel/types';
import { useUserId } from '@core/context/user';
import { useChannelType } from '@core/context/channels';
import { useRemoveParticipantsMutation } from '@queries/channel/participants';
import { ENABLE_LIVE_INDICATORS } from '@core/constant/featureFlags';
import { Layer } from '@ui';
import { cn } from '@ui/utils/classname';
import UsersIcon from '@icon/regular/users.svg';
import DotsThreeIcon from '@icon/regular/dots-three.svg';
import ChatIcon from '@icon/regular/chat-text.svg';
import PhoneIcon from '@icon/regular/phone.svg';
import CopyIcon from '@icon/regular/copy.svg';
import TrashIcon from '@icon/regular/trash.svg';
import SearchIcon from '@icon/regular/magnifying-glass.svg';

const MAX_USER_INDICATORS = 3;

function UserIndicator(props: { userId: string; isOnly?: boolean }) {
  return (
    <div class={cn("bg-panel size-6 rounded-full p-[2px]", !props.isOnly && "-mr-3")}>
      <UserIcon id={props.userId} isDeleted={false} size="fill" />
    </div>
  );
}

function ParticipantRow(props: {
  participant: ChannelParticipant;
  isActive?: boolean;
  canRemove: boolean;
  onMessage: () => void;
  onCall: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const email = () => idToEmail(props.participant.user_id);

  const copyEmail = () => {
    navigator.clipboard.writeText(email());
  };

  const copyId = () => {
    navigator.clipboard.writeText(props.participant.user_id);
  };

  return (
    <div class="flex items-center gap-2 px-2 py-1 hover:bg-ink/5 rounded-md group">
      <div class="relative shrink-0">
        <UserIcon id={props.participant.user_id} size="sm" />
        <Show when={props.isActive}>
          <div class="absolute -bottom-0.5 -right-0.5 size-2.5 bg-green-500 rounded-full border-2 border-panel" />
        </Show>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium truncate leading-tight">
          {email().split('@')[0]}
        </div>
        <div class="text-xxs text-ink-extra-muted capitalize leading-tight">
          {props.participant.role}
        </div>
      </div>
      <DropdownMenu open={menuOpen()} onOpenChange={setMenuOpen}>
        <DropdownMenu.Trigger
          class={cn(
            "size-6 flex items-center justify-center rounded-md hover:bg-ink/10 transition-opacity",
            menuOpen() ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <DotsThreeIcon class="size-4" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="z-[100] min-w-40">
            <Layer depth={4}>
              <div class="bg-panel rounded-lg ring-1 ring-edge-muted shadow-md p-1">
                <DropdownMenu.Item
                  class="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-hover outline-none rounded-md"
                  onSelect={props.onMessage}
                >
                  <ChatIcon class="size-4 text-ink-muted" />
                  <span>Send message</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  class="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-hover outline-none rounded-md"
                  onSelect={props.onCall}
                >
                  <PhoneIcon class="size-4 text-ink-muted" />
                  <span>Call</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  class="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-hover outline-none rounded-md"
                  onSelect={copyEmail}
                >
                  <CopyIcon class="size-4 text-ink-muted" />
                  <span>Copy email</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  class="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-hover outline-none rounded-md"
                  onSelect={copyId}
                >
                  <CopyIcon class="size-4 text-ink-muted" />
                  <span>Copy ID</span>
                </DropdownMenu.Item>
                <Show when={props.canRemove}>
                  <DropdownMenu.Item
                    class="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-hover outline-none rounded-md text-red-500"
                    onSelect={props.onRemove}
                  >
                    <TrashIcon class="size-4" />
                    <span>Remove</span>
                  </DropdownMenu.Item>
                </Show>
              </div>
            </Layer>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </div>
  );
}

export function ChannelParticipantsIndicator(props: {
  channelId: string;
  participants: ChannelParticipant[];
  activeUserIds: string[];
}) {
  const currentUserId = useUserId();
  const channelType = useChannelType(props.channelId);
  const { replaceOrInsertSplit } = useSplitLayout();
  const removeParticipantsMutation = useRemoveParticipantsMutation();

  const [isOpen, setIsOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');

  const canManageParticipants = () =>
    channelType() !== ChannelType.organization;

  const activeUserIdsExcludingSelf = createMemo(() =>
    props.activeUserIds.filter((id) => id !== currentUserId())
  );

  const hasActiveUsers = () => activeUserIdsExcludingSelf().length > 0;

  const filteredParticipants = createMemo(() => {
    const query = searchQuery().trim().toLowerCase();
    if (query.length === 0) return props.participants;
    return props.participants.filter((p) => {
      const email = idToEmail(p.user_id).toLowerCase();
      return email.includes(query) || p.role.toLowerCase().includes(query);
    });
  });

  const activeParticipants = createMemo(() =>
    filteredParticipants().filter((p) =>
      activeUserIdsExcludingSelf().includes(p.user_id)
    )
  );

  const otherParticipants = createMemo(() =>
    filteredParticipants().filter(
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
      replaceOrInsertSplit({ type: 'channel', id: channelId });
    }
  };

  const startCall = async (participantId: string) => {
    const result = await commsServiceClient.getOrCreateDirectMessage({
      recipient_id: participantId,
    });
    const channelId = isOk(result) && result[1]?.channel_id;
    if (channelId) {
      replaceOrInsertSplit({ type: 'channel', id: channelId, join_call: 'true' });
    }
  };

  const removeParticipant = (participantId: string) => {
    removeParticipantsMutation.mutate({
      channelId: props.channelId,
      participants: [participantId],
    });
  };

  const canRemoveParticipant = (participantId: string) =>
    canManageParticipants() && participantId !== currentUserId();

  return (
    <Popover open={isOpen()} onOpenChange={setIsOpen} placement="bottom-end">
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
            "flex items-center justify-center shrink-0 overflow-hidden isolate rounded-md",
            activeUserIdsExcludingSelf().length === 1 ? "size-7" : "pl-2 pr-4",
            isOpen() && "bg-ink/10"
          )}>
            <For each={activeUserIdsExcludingSelf().slice(0, MAX_USER_INDICATORS)}>
              {(userId, index) => (
                <UserIndicator
                  userId={userId}
                  isOnly={activeUserIdsExcludingSelf().length === 1}
                />
              )}
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
        <Popover.Content class="z-50 w-72 flex flex-col">
          <Layer depth={3}>
            <div class="bg-panel rounded-lg ring-1 ring-edge-muted shadow-md flex flex-col max-h-[420px]">
              <div class="px-3 pt-3 pb-2 shrink-0">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-sm font-medium text-ink">Participants</span>
                  <span class="text-xs text-ink-muted">{props.participants.length}</span>
                </div>
                <div class="relative">
                  <SearchIcon class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-faint z-10 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filter by name or role"
                    value={searchQuery()}
                    onInput={(e) => setSearchQuery(e.currentTarget.value)}
                    class="w-full pl-8 pr-3 py-1 text-sm bg-menu rounded-md border border-edge-muted focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-ink-faint"
                  />
                </div>
              </div>
              <div class="overflow-y-auto px-3 pb-3 flex-1">
                <Show when={activeParticipants().length > 0}>
                  <div class="text-xs font-medium text-ink-muted py-1.5">
                    Active
                  </div>
                  <For each={activeParticipants()}>
                    {(participant) => (
                      <ParticipantRow
                        participant={participant}
                        isActive
                        canRemove={canRemoveParticipant(participant.user_id)}
                        onMessage={() => openDirectMessage(participant.user_id)}
                        onCall={() => startCall(participant.user_id)}
                        onRemove={() => removeParticipant(participant.user_id)}
                      />
                    )}
                  </For>
                </Show>
                <Show when={otherParticipants().length > 0}>
                  <Show when={activeParticipants().length > 0}>
                    <div class="text-xs font-medium text-ink-muted py-1.5 mt-1">
                      Members
                    </div>
                  </Show>
                  <For each={otherParticipants()}>
                    {(participant) => (
                      <ParticipantRow
                        participant={participant}
                        canRemove={canRemoveParticipant(participant.user_id)}
                        onMessage={() => openDirectMessage(participant.user_id)}
                        onCall={() => startCall(participant.user_id)}
                        onRemove={() => removeParticipant(participant.user_id)}
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
