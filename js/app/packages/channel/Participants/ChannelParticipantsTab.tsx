import { useSplitLayout } from '@app/component/split-layout/layout';
import { toast } from '@core/component/Toast/Toast';
import { useChannelType } from '@core/context/channels';
import { useUserId } from '@core/context/user';
import { idToDisplayName } from '@core/user';
import IconRobot from '@phosphor/robot.svg';
import {
  useAddBotToChannelMutation,
  useChannelBotsQuery,
  useRemoveBotFromChannelMutation,
} from '@queries/channel/channel-bots';
import { useChannelParticipantsQuery } from '@queries/channel/channel-participants';
import { useGetOrCreateDirectMessageMutation } from '@queries/channel/get-or-create-dm';
import {
  isBotSenderId,
  senderFromStorageId,
} from '@queries/channel/message-sender';
import {
  useAddParticipantsMutation,
  useRemoveParticipantsMutation,
} from '@queries/channel/participants';
import type { Bot } from '@service-storage/generated/schemas/bot';
import { ChannelType } from '@service-storage/generated/schemas/channelType';
import { Avatar, Button, Panel } from '@ui';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { AddBotDialog } from './AddBotDialog';
import { AddBotMenu } from './AddBotMenu';
import { ParticipantsAddPanel } from './ParticipantsAddPanel';
import {
  ParticipantsList,
  type ParticipantsListItemData,
} from './ParticipantsList';
import { ParticipantsSearchInput } from './ParticipantsSearchInput';

export function ChannelParticipantsTab(props: { channelId: string }) {
  const { replaceOrInsertSplit } = useSplitLayout();
  const userId = useUserId();
  const channelType = useChannelType(props.channelId);
  const participantsQuery = useChannelParticipantsQuery(() => props.channelId);
  const channelBotsQuery = useChannelBotsQuery(() => ({
    channelId: props.channelId,
  }));
  const addParticipantsMutation = useAddParticipantsMutation();
  const removeParticipantsMutation = useRemoveParticipantsMutation();
  const addBotToChannelMutation = useAddBotToChannelMutation();
  const removeBotFromChannelMutation = useRemoveBotFromChannelMutation();
  const getOrCreateDmMutation = useGetOrCreateDirectMessageMutation();
  const [searchQuery, setSearchQuery] = createSignal('');
  const [addBotOpen, setAddBotOpen] = createSignal(false);
  const [createdBots, setCreatedBots] = createSignal<Bot[]>([]);

  const participants = () => participantsQuery.data ?? [];
  const channelBots = () => channelBotsQuery.data ?? [];
  const channelBotIds = () => new Set(channelBots().map((bot) => bot.id));

  // Bots created via the dialog this session but not yet added to the channel.
  const ghostBots = (): Bot[] =>
    createdBots().filter((bot) => !channelBotIds().has(bot.id));

  const addBot = (botId: string) => {
    addBotToChannelMutation.mutate(
      { channelId: props.channelId, botId },
      {
        onSuccess: () => toast.success('Bot added to channel'),
        onError: () => toast.failure('Failed to add bot'),
      }
    );
  };

  const canAddParticipants = () => channelType() === ChannelType.private;
  const isEditable = () => canAddParticipants();

  const matchesSearch = (item: ParticipantsListItemData) => {
    const query = searchQuery().trim().toLowerCase();
    if (!query) return true;

    return (
      item.id.toLowerCase().includes(query) ||
      item.displayName.toLowerCase().includes(query) ||
      item.role.toLowerCase().includes(query)
    );
  };

  const compareParticipantItems = (
    a: ParticipantsListItemData,
    b: ParticipantsListItemData
  ) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: 'base',
    });

  const botItems = () =>
    channelBots()
      .map(
        (bot): ParticipantsListItemData => ({
          id: `bot|${bot.id}`,
          displayName: bot.name,
          role: 'bot',
          avatarUrl: bot.avatar_url,
          secondaryText: `@${bot.handle}`,
        })
      )
      .filter(matchesSearch)
      .toSorted(compareParticipantItems);

  const memberItems = () =>
    participants()
      .filter((participant) => !isBotSenderId(participant.user_id))
      .map(
        (participant): ParticipantsListItemData => ({
          id: participant.user_id,
          displayName: idToDisplayName(participant.user_id),
          role: participant.role,
        })
      )
      .filter(matchesSearch)
      .toSorted(compareParticipantItems);

  const memberListItems = createMemo<ParticipantsListItemData[]>(() =>
    memberItems()
  );

  const botListItems = createMemo<ParticipantsListItemData[]>(() => {
    const bots = botItems();
    const query = searchQuery().trim();

    if (query && bots.length === 0 && channelBots().length > 0) return [];

    return bots;
  });

  const botsEmptyState = () => {
    if (channelBots().length > 0) return undefined;
    // Ghost rows render above the list, so suppress the placeholder entirely.
    if (ghostBots().length > 0) return <></>;
    return (
      <div class="flex flex-col items-center px-6 py-8 text-center">
        <div class="text-sm font-medium text-ink">No bots yet</div>
        <div class="mt-1 text-sm text-ink-muted">
          Add a bot to post into this channel from a webhook.
        </div>
        <Show when={isEditable()}>
          <AddBotMenu
            channelId={props.channelId}
            createdBots={createdBots()}
            onCreateNew={() => setAddBotOpen(true)}
            triggerClass="mt-4"
          />
        </Show>
      </div>
    );
  };

  const addParticipants = (participantIds: string[]) => {
    if (!isEditable() || participantIds.length === 0) return;

    addParticipantsMutation.mutate({
      channelId: props.channelId,
      participants: participantIds,
    });
  };

  const removeParticipant = (participantId: string) => {
    if (!isEditable()) return;

    if (isBotSenderId(participantId)) {
      removeBotFromChannelMutation.mutate({
        channelId: props.channelId,
        botId: senderFromStorageId(participantId).id,
      });
      return;
    }

    removeParticipantsMutation.mutate({
      channelId: props.channelId,
      participants: [participantId],
    });
  };

  const openDirectMessage = (participantId: string) => {
    if (isBotSenderId(participantId)) return;

    getOrCreateDmMutation.mutate(
      { recipient_id: participantId },
      {
        onSuccess: ({ channel_id }) => {
          replaceOrInsertSplit({ type: 'channel', id: channel_id });
        },
      }
    );
  };

  return (
    <>
      <div class="relative flex-1 min-h-0 h-full overflow-hidden flex justify-center p-2">
        <div
          class="macro-message-width size-full"
          style={{
            'grid-template-rows': 'minmax(0, 1fr) minmax(12rem, 1fr)',
            'grid-template-columns': '1fr',
            overflow: 'hidden',
            display: 'grid',
            gap: '8px',
          }}
        >
          <Panel depth={2} class="h-auto overflow-hidden text-ink">
            <Panel.Header class="px-6">
              <div class="text-sm font-medium">Participants</div>
            </Panel.Header>
            <Panel.Toolbar class="h-15.25 px-2">
              <ParticipantsSearchInput
                value={searchQuery()}
                onInput={setSearchQuery}
              />
            </Panel.Toolbar>
            <Panel.Body>
              <div class="flex h-full flex-col">
                <Show when={isEditable()}>
                  <div class="px-6 py-3 border-b border-edge-muted shrink-0">
                    <ParticipantsAddPanel
                      participants={participants}
                      onAddParticipants={addParticipants}
                    />
                  </div>
                </Show>
                <div class="relative min-h-0 flex-1">
                  <ParticipantsList
                    items={memberListItems}
                    searchQuery={searchQuery}
                    currentUserId={userId() ?? undefined}
                    editable={isEditable()}
                    onParticipantClick={openDirectMessage}
                    onRemoveParticipant={removeParticipant}
                  />
                </div>
              </div>
            </Panel.Body>
          </Panel>
          <Panel depth={2} class="min-h-48 h-auto overflow-hidden text-ink">
            <Panel.Header class="justify-between px-6">
              <div class="text-sm font-medium">Bots</div>
              <Show
                when={
                  isEditable() &&
                  (channelBots().length > 0 || ghostBots().length > 0)
                }
              >
                <AddBotMenu
                  channelId={props.channelId}
                  createdBots={createdBots()}
                  onCreateNew={() => setAddBotOpen(true)}
                />
              </Show>
            </Panel.Header>
            <Panel.Body>
              <div class="flex h-full flex-col">
                <Show when={ghostBots().length > 0}>
                  <div class="shrink-0">
                    <For each={ghostBots()}>
                      {(bot) => (
                        <div class="mx-3 my-2 flex items-center justify-between gap-2 rounded-lg border border-dashed border-accent/50 bg-accent-bg/50 px-3 py-2 text-sm">
                          <div class="flex min-w-0 flex-1 items-center gap-3">
                            <div class="shrink-0 opacity-90">
                              <Avatar size="lg">
                                <Show
                                  when={bot.avatar_url}
                                  fallback={
                                    <Avatar.Fallback>
                                      <IconRobot class="size-4" />
                                    </Avatar.Fallback>
                                  }
                                >
                                  {(avatarUrl) => (
                                    <Avatar.Image
                                      src={avatarUrl()}
                                      alt={bot.name}
                                    />
                                  )}
                                </Show>
                              </Avatar>
                            </div>
                            <div class="min-w-0 flex-1">
                              <div class="flex min-w-0 items-center gap-2">
                                <span class="truncate text-sm font-medium text-ink">
                                  {bot.name}
                                </span>
                                <span class="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                                  Not added
                                </span>
                              </div>
                              <div class="truncate text-xs text-ink-muted">
                                @{bot.handle}
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="cta"
                            size="sm"
                            class="shrink-0"
                            onClick={() => addBot(bot.id)}
                          >
                            Add to channel
                          </Button>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
                <div class="relative min-h-0 flex-1">
                  <ParticipantsList
                    items={botListItems}
                    emptyState={botsEmptyState()}
                    searchQuery={searchQuery}
                    currentUserId={userId() ?? undefined}
                    editable={isEditable()}
                    onParticipantClick={openDirectMessage}
                    onRemoveParticipant={removeParticipant}
                  />
                </div>
              </div>
            </Panel.Body>
          </Panel>
        </div>
      </div>

      <AddBotDialog
        open={addBotOpen()}
        onOpenChange={setAddBotOpen}
        onCreated={(bot) =>
          setCreatedBots((prev) => [
            bot,
            ...prev.filter((existing) => existing.id !== bot.id),
          ])
        }
      />
    </>
  );
}
