import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { useEmail } from '@core/context/user';
import { idToDisplayName } from '@core/user/util';
import CheckIcon from '@phosphor/check.svg';
import Plus from '@phosphor/plus.svg';
import XIcon from '@phosphor/x.svg';
import { useContacts } from '@queries/contacts/contacts';
import { useOnboardingQuery } from '@queries/onboarding';
import {
  useJoinTeamMutation,
  useUserInvitesQuery,
} from '@queries/team/invitations';
import {
  useCreateTeamWithInvitesMutation,
  useUserTeamsQuery,
} from '@queries/team/teams';
import type { TeamInviteDetails } from '@service-auth/generated/schemas/teamInviteDetails';
import { Button } from '@ui';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  Show,
} from 'solid-js';
import {
  ContinueButton,
  deriveTeamName,
  FormInput,
  SkipButton,
} from './shared';
import {
  INITIAL_INVITE_SLOTS,
  prefillableTeammates,
  removeInviteSlot,
  validInviteEmails,
  withPrefilledTeammates,
} from './teamInvites';

/** Set up your team: already a member → confirmation, pending invites →
 * join, otherwise create (with a domain-derived name and same-domain
 * teammates pre-added to the invite list). */
export function TeamStep(props: {
  onContinue: () => void;
  onSkip: () => void;
}) {
  const analytics = useAnalytics();
  const teamsQuery = useUserTeamsQuery();
  const invitesQuery = useUserInvitesQuery();

  const team = createMemo(() => teamsQuery.data?.[0]);
  const invites = createMemo(() => invitesQuery.data?.invites ?? []);

  // One-shot on the FIRST resolved teams payload, so a create/join later
  // in this step doesn't also read as auto-joined.
  let membershipReported = false;
  createEffect(() => {
    if (membershipReported || teamsQuery.data === undefined) return;
    membershipReported = true;
    if (teamsQuery.data.length > 0) {
      analytics.track('onboarding_v4_team', { action: 'already_on_team' });
    }
  });

  return (
    <Show
      when={!team()}
      fallback={
        <OnTeamPanel name={team()?.name} onContinue={props.onContinue} />
      }
    >
      <Show
        when={invites().length === 0}
        fallback={<InvitesPanel invites={invites()} onSkip={props.onSkip} />}
      >
        <CreateTeamForm onContinue={props.onContinue} onSkip={props.onSkip} />
      </Show>
    </Show>
  );
}

/** Already on a team — auto-joined by domain, or just created/joined here. */
function OnTeamPanel(props: { name?: string; onContinue: () => void }) {
  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-col items-center gap-2 py-4 text-center">
        <span class="flex size-10 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckIcon class="size-5" />
        </span>
        <p class="text-sm font-medium text-ink">
          You're on {props.name ?? 'your team'}
        </p>
        {/* Copy must stay true for auto-join, invite-accept, and the
            optimistic mid-create flash alike. */}
        <p class="max-w-xs text-xs text-ink-muted leading-snug">
          Your team is set up — everything your teammates bring into Macro is
          shared with you.
        </p>
      </div>
      <ContinueButton onClick={props.onContinue} />
    </div>
  );
}

/** Pending team invites — join one and move on. */
function InvitesPanel(props: {
  invites: TeamInviteDetails[];
  onSkip: () => void;
}) {
  const analytics = useAnalytics();
  const joinTeam = useJoinTeamMutation({
    onSuccess: () => {
      analytics.track('onboarding_v4_team', { action: 'joined_invite' });
    },
  });

  return (
    <div class="flex flex-col gap-3">
      <For each={props.invites}>
        {(invite) => (
          <div class="flex items-center gap-2.5 rounded-lg border border-edge bg-surface px-4 py-3 text-sm">
            <span class="min-w-0 truncate text-ink">
              {idToDisplayName(invite.invited_by)} invited you to their team
            </span>
            <Button
              variant="cta"
              size="sm"
              class="ml-auto shrink-0"
              disabled={joinTeam.isPending}
              onClick={() => joinTeam.mutate({ teamInviteId: invite.id })}
            >
              Join
            </Button>
          </div>
        )}
      </For>
      <SkipButton onClick={props.onSkip} />
    </div>
  );
}

/** Create a team: pre-derived name + same-domain teammates already sitting in
 * the invite list (remove to opt them out); the plain form otherwise. */
function CreateTeamForm(props: { onContinue: () => void; onSkip: () => void }) {
  const analytics = useAnalytics();
  const email = useEmail();
  const contacts = useContacts();
  const createTeam = useCreateTeamWithInvitesMutation();
  const onboardingQuery = useOnboardingQuery();

  // Server-judged with the same list the teams service uses for
  // auto-join/claiming, so we never suggest a team the server would refuse.
  const customDomain = () =>
    onboardingQuery.data?.suggested_team_domain ?? undefined;

  const [name, setName] = createSignal('');
  const [nameTouched, setNameTouched] = createSignal(false);
  // Prefill once the suggestion arrives, never over a typed name.
  createEffect(() => {
    const domain = customDomain();
    if (domain && !nameTouched()) setName(deriveTeamName(domain));
  });
  const [inviteSlots, setInviteSlots] = createSignal<string[]>([
    ...INITIAL_INVITE_SLOTS,
  ]);
  let inviteListEl: HTMLDivElement | undefined;

  const validInvites = () => validInviteEmails(inviteSlots(), email());

  // Same-domain teammates are pre-added rather than offered: the default is
  // "invite them", and removing a row is how you opt one out.
  const [prefilled, setPrefilled] = createSignal<string[]>([]);
  let hasPrefilled = false;
  createEffect(() => {
    if (hasPrefilled) return;
    const teammates = prefillableTeammates({
      contacts: contacts(),
      domain: customDomain(),
      ownEmail: email(),
      slots: inviteSlots(),
    });
    // Contacts and the domain suggestion land asynchronously — keep waiting
    // (and keep tracking) until there's actually someone to pre-add.
    if (teammates.length === 0) return;
    hasPrefilled = true;
    setPrefilled(teammates);
    setInviteSlots((slots) => withPrefilledTeammates(slots, teammates));
  });

  /** Prefilled teammates the user took back out before submitting. */
  const removedPrefills = () => {
    const kept = new Set(validInvites());
    return prefilled().filter((address) => !kept.has(address)).length;
  };

  // The X means "don't invite this person", so it belongs on rows that name
  // one. Blank rows need no removing — they're dropped on submit anyway.
  const canRemoveSlot = (value: string) => value.trim() !== '';

  const addEmptyInvite = () => {
    setInviteSlots((slots) => [...slots, '']);
    requestAnimationFrame(() => {
      inviteListEl?.lastElementChild?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  };

  const create = async () => {
    if (createTeam.isPending || name().trim().length === 0) return;
    // The mutation owns its toasts; stay put (form intact) on failure.
    const invitesSent = validInvites().length;
    const invitesPrefilled = prefilled().length;
    const invitesRemoved = removedPrefills();
    try {
      await createTeam.mutateAsync({
        name: name().trim(),
        invites: validInvites().map((address) => ({ email: address })),
      });
    } catch {
      return;
    }
    analytics.track('onboarding_v4_team', {
      action: 'created',
      invites_sent: invitesSent,
      invites_prefilled: invitesPrefilled,
      invites_removed: invitesRemoved,
      used_domain_suggestion: customDomain() !== undefined,
    });
    props.onContinue();
  };

  return (
    <div class="flex flex-col gap-3">
      {/* Same row shape as an invite, with the remove gutter left empty, so
          every input in the form shares one width. Labelled, because the
          name arrives pre-filled — a placeholder alone would be invisible
          exactly when the field needs explaining. */}
      <div class="flex items-center gap-1.5">
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <label for="team-name" class="text-xs text-ink-muted">
            Team name
          </label>
          <FormInput
            id="team-name"
            // An example, not "Team name" again — the label says that.
            placeholder="Acme Inc."
            value={name()}
            autoFocus={!customDomain()}
            onInput={(value) => {
              setNameTouched(true);
              setName(value);
            }}
          />
        </div>
        <div class="size-7 shrink-0" />
      </div>

      <Show when={prefilled().length > 0}>
        {/* Say the quiet part out loud: these go out unless removed. */}
        <p class="text-xs text-ink-muted leading-snug">
          Your teammates at {customDomain()} are ready to invite — remove anyone
          you'd rather leave out.
        </p>
      </Show>

      {/* Index, not For: slots are edited strings, and For keys by value —
          each keystroke would recreate the input node and drop focus.
          No inner scroller: the list opens pre-filled now, and a capped box
          left a row sliced in half above the buttons — the flow's own
          scroll container takes the height instead. */}
      <div ref={(el) => (inviteListEl = el)} class="flex flex-col gap-3">
        <Index each={inviteSlots()}>
          {(slot, i) => (
            <div class="flex items-center gap-1.5">
              <div class="min-w-0 flex-1">
                <FormInput
                  id={`invite-${i}`}
                  type="email"
                  placeholder="teammate@company.com"
                  value={slot()}
                  onInput={(value) =>
                    setInviteSlots((slots) =>
                      slots.map((v, j) => (j === i ? value : v))
                    )
                  }
                />
              </div>
              {/* Gutter is always reserved, so a blank row's input still lines
                  up with the ones carrying a remove button. */}
              <div class="flex size-7 shrink-0 items-center justify-center">
                <Show when={canRemoveSlot(slot())}>
                  <button
                    type="button"
                    aria-label={`Don't invite ${slot().trim()}`}
                    title={`Don't invite ${slot().trim()}`}
                    onClick={() =>
                      setInviteSlots((slots) => removeInviteSlot(slots, i))
                    }
                    class="rounded-md p-1.5 text-ink-extra-muted transition-colors hover:bg-ink/5 hover:text-ink"
                  >
                    <XIcon class="size-4" />
                  </button>
                </Show>
              </div>
            </div>
          )}
        </Index>
      </div>

      <Button
        variant="ghost"
        size="sm"
        class="self-center text-ink-muted"
        onClick={addEmptyInvite}
      >
        <Plus class="size-4" />
        Add another teammate
      </Button>

      <ContinueButton
        label={
          validInvites().length > 0
            ? `Create team & invite ${validInvites().length}`
            : 'Create team'
        }
        disabled={name().trim().length === 0 || createTeam.isPending}
        onClick={() => void create()}
      />
      <SkipButton onClick={props.onSkip} />
    </div>
  );
}
