import { useSplitLayout } from '@app/component/split-layout/layout';
import { useChannelType } from '@core/context/channels';
import { useUserId } from '@core/context/user';
import { idToDisplayName } from '@core/user';
import {
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
import { ChannelType } from '@service-storage/generated/schemas/channelType';
import { Button, Panel } from '@ui';
import { createMemo, createSignal, Show } from 'solid-js';
import { AddBotDialog } from './AddBotDialog';
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
  const removeBotFromChannelMutation = useRemoveBotFromChannelMutation();
  const getOrCreateDmMutation = useGetOrCreateDirectMessageMutation();
  const [searchQuery, setSearchQuery] = createSignal('');
  const [addBotOpen, setAddBotOpen] = createSignal(false);

  const participants = () => participantsQuery.data ?? [];
  const channelBots = () => channelBotsQuery.data ?? [];
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
              <Show when={isEditable() && channelBots().length > 0}>
                <Button
                  type="button"
                  variant="cta"
                  size="sm"
                  label="Add bot"
                  onClick={() => setAddBotOpen(true)}
                >
                  Add bot
                </Button>
              </Show>
            </Panel.Header>
            <Panel.Body>
              <ParticipantsList
                items={botListItems}
                emptyState={
                  channelBots().length === 0 ? (
                    <div class="flex flex-col items-center px-6 py-8 text-center">
                      <div class="text-sm font-medium text-ink">
                        No bots yet
                      </div>
                      <div class="mt-1 text-sm text-ink-muted">
                        Add a bot to post into this channel from a webhook.
                      </div>
                      <Show when={isEditable()}>
                        <Button
                          type="button"
                          variant="cta"
                          size="sm"
                          label="Add bot"
                          class="mt-4"
                          onClick={() => setAddBotOpen(true)}
                        >
                          Add bot
                        </Button>
                      </Show>
                    </div>
                  ) : undefined
                }
                searchQuery={searchQuery}
                currentUserId={userId() ?? undefined}
                editable={isEditable()}
                onParticipantClick={openDirectMessage}
                onRemoveParticipant={removeParticipant}
              />
            </Panel.Body>
          </Panel>
        </div>
      </div>

      <AddBotDialog
        channelId={props.channelId}
        open={addBotOpen()}
        onOpenChange={setAddBotOpen}
      />
    </>
  );
}
