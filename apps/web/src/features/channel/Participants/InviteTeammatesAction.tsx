import { toast } from '@core/component/Toast/Toast';
import { UserIcon } from '@core/component/UserIcon';
import { useChannelType } from '@core/context/channels';
import { idToDisplayName, idToEmail } from '@core/user';
import { Popover } from '@kobalte/core/popover';
import UserPlusIcon from '@phosphor/user-plus.svg';
import { useChannelParticipantsQuery } from '@queries/channel/channel-participants';
import { useAddParticipantsMutation } from '@queries/channel/participants';
import { useCurrentTeamQuery } from '@queries/team/teams';
import { ChannelType } from '@service-storage/generated/schemas/channelType';
import { Button, Layer } from '@ui';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';

type InviteCandidate = {
  id: string;
  name: string;
  email: string;
};

/**
 * A composer-footer pill that invites teammates into the channel without
 * leaving the conversation. Opens a searchable list of team members who
 * aren't participants yet; picking one adds them to the channel, which
 * sends them the standard channel invite notification.
 *
 * Renders nothing for channel types that don't support adding participants
 * (DMs, public channels) or when the viewer doesn't belong to a team,
 * mirroring the participants tab's add rules.
 */
export function InviteTeammatesAction(props: { channelId: string }) {
  const channelType = useChannelType(props.channelId);
  const participantsQuery = useChannelParticipantsQuery(() => props.channelId);
  const currentTeamQuery = useCurrentTeamQuery();
  const addParticipantsMutation = useAddParticipantsMutation({
    onSuccess(_response, vars) {
      const invited = vars.participants[0];
      if (invited) {
        toast.success(`Invite sent to ${idToDisplayName(invited)}`);
      }
    },
  });

  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal('');

  // The component outlives the popover content, so reset the search when it
  // closes or reopening shows a stale filter.
  const onOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) setQuery('');
  };

  // Mirrors ChannelParticipantsTab's canAddParticipants: the backend rejects
  // participant changes on DMs, and public channels are join-only.
  const canInvite = () =>
    channelType() === ChannelType.private || channelType() === ChannelType.team;

  const loaded = () => !!currentTeamQuery.data && !!participantsQuery.data;

  const candidates = createMemo<InviteCandidate[]>(() => {
    const members = currentTeamQuery.data?.members ?? [];
    const participantIds = new Set(
      (participantsQuery.data ?? []).map((participant) => participant.user_id)
    );
    return members
      .filter((member) => !participantIds.has(member.user_id))
      .map((member) => ({
        id: member.user_id,
        name: idToDisplayName(member.user_id),
        email: idToEmail(member.user_id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  const visibleCandidates = createMemo<InviteCandidate[]>(() => {
    const term = query().trim().toLowerCase();
    if (!term) return candidates();
    return candidates().filter(
      (candidate) =>
        candidate.name.toLowerCase().includes(term) ||
        candidate.email.toLowerCase().includes(term)
    );
  });

  const invite = (candidate: InviteCandidate) => {
    addParticipantsMutation.mutate({
      channelId: props.channelId,
      participants: [candidate.id],
    });
  };

  return (
    <Show when={canInvite() && currentTeamQuery.data}>
      <Popover
        placement="top"
        gutter={8}
        overflowPadding={8}
        slide
        open={open()}
        onOpenChange={onOpenChange}
      >
        <Popover.Trigger
          as={Button}
          type="button"
          variant="ghost"
          size="sm"
          title="Invite teammates"
          aria-label="Invite teammates"
          tooltip="Invite teammates"
          tooltipPlacement="top"
          class="h-7 gap-1.5 rounded-full border border-edge-muted bg-surface px-2.5 text-xs font-normal text-ink-muted"
          data-input-action="invite-teammates"
        >
          <UserPlusIcon />
          Invite
        </Popover.Trigger>
        <Popover.Portal>
          <Layer depth={3}>
            <Popover.Content class="z-modal">
              <div
                class="flex w-72 flex-col gap-2 rounded-md border border-edge bg-surface p-2 shadow-lg"
                role="dialog"
                aria-label="Invite teammates"
              >
                <div class="flex w-full flex-row items-center gap-1 rounded-md border border-edge-muted px-2 py-1 text-xs text-ink">
                  <input
                    class="w-full bg-transparent outline-none placeholder:text-ink-muted"
                    value={query()}
                    onInput={(event) => setQuery(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      const first = visibleCandidates()[0];
                      if (!first) return;
                      event.preventDefault();
                      invite(first);
                      setQuery('');
                    }}
                    placeholder="Search teammates"
                    role="searchbox"
                    aria-label="Search teammates"
                  />
                </div>
                <div class="max-h-64 overflow-y-auto overflow-x-hidden">
                  <Switch>
                    <Match when={visibleCandidates().length > 0}>
                      <div class="flex flex-col">
                        <For each={visibleCandidates()}>
                          {(candidate) => (
                            <button
                              type="button"
                              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover"
                              onClick={() => invite(candidate)}
                              data-invite-teammate={candidate.id}
                            >
                              <UserIcon
                                id={candidate.id}
                                size="md"
                                suppressClick
                                showTooltip={false}
                              />
                              <span class="flex min-w-0 flex-col">
                                <span class="truncate text-sm text-ink">
                                  {candidate.name}
                                </span>
                                <span class="truncate text-xs text-ink-muted">
                                  {candidate.email}
                                </span>
                              </span>
                            </button>
                          )}
                        </For>
                      </div>
                    </Match>
                    <Match when={loaded() && candidates().length === 0}>
                      <div class="px-2 py-1.5 text-xs text-ink-muted">
                        Everyone on your team is already in this channel.
                      </div>
                    </Match>
                    <Match when={loaded()}>
                      <div class="px-2 py-1.5 text-xs text-ink-muted">
                        No teammates match your search.
                      </div>
                    </Match>
                    <Match when>
                      <div class="px-2 py-1.5 text-xs text-ink-muted">
                        Loading teammates…
                      </div>
                    </Match>
                  </Switch>
                </div>
              </div>
            </Popover.Content>
          </Layer>
        </Popover.Portal>
      </Popover>
    </Show>
  );
}
