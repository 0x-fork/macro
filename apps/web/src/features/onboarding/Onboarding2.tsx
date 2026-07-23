import {
  PLAN_FEATURES,
  PLANS,
  type PlanTier,
} from '@app/features/paywall/plans';
import IconGoogle from '@icon/macro-google.svg';
import LogoIcon from '@icon/macro-logo.svg';
import LinearIcon from '@icon/mcp-linear.svg';
import NotionIcon from '@icon/mcp-notion.svg';
import SlackIcon from '@icon/mcp-slack.svg';
import ArrowLeft from '@phosphor/arrow-left.svg';
import ArrowRight from '@phosphor/arrow-right.svg';
import Check from '@phosphor/check.svg';
import CircleNotch from '@phosphor/circle-notch.svg';
import Plus from '@phosphor/plus.svg';
import { useNavigate } from '@solidjs/router';
import { Button, cn } from '@ui';
import { Stepper } from '@ui/components/Stepper';
import {
  createMemo,
  createSignal,
  Index,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { createStore } from 'solid-js/store';

/**
 * Onboarding2 — the new signup / onboarding flow (`/onboarding2`).
 *
 * This is a UI-first draft: every screen is real, but none of the
 * integrations are wired up yet. Left intentionally unwired (mocked):
 *
 * - Email + team name are captured into local state only; no auth code is
 *   sent yet (the code step comes later, and only for users who skip
 *   connecting a Google account — connected Google users won't need it).
 * - Google / Linear / Notion / Slack "Connect" buttons fake a short OAuth
 *   round-trip with a setTimeout instead of starting real OAuth.
 * - The "building your unified memory" screen is a pure animation on
 *   timers; nothing is actually gathered.
 * - Plan selection is stored locally; no checkout session is created.
 * - Team invites are captured but not sent.
 * - The final CTA navigates to `/`, which will bounce to /login until the
 *   flow actually creates an account/session.
 */

enum Ob2Step {
  Welcome = 0,
  Google = 1,
  Linear = 2,
  Notion = 3,
  Slack = 4,
  Building = 5,
  Plan = 6,
  Invite = 7,
}

type ConnectStatus = 'idle' | 'connecting' | 'connected';

/** Steps that get a progress dot — Building is a transition, not a stop. */
const DOT_STEPS: Ob2Step[] = [
  Ob2Step.Welcome,
  Ob2Step.Google,
  Ob2Step.Linear,
  Ob2Step.Notion,
  Ob2Step.Slack,
  Ob2Step.Plan,
  Ob2Step.Invite,
];

type GoogleSlot = {
  label: string;
  status: ConnectStatus;
};

const MAX_GOOGLE_ACCOUNTS = 4;

/** Fake OAuth round-trip time. TODO: replace with the real connect flows. */
const MOCK_CONNECT_MS = 900;

const BUILDING_PHRASES = [
  'Building your unified memory…',
  'Creating your shared brain…',
  'Synthesizing cyberspace…',
  'Weaving your knowledge graph…',
  'Linking people, docs, and threads…',
  'Distilling months of context…',
  'Waking up your Macro…',
];
const BUILDING_PHRASE_MS = 1500;

function FormInput(props: {
  id: string;
  type?: string;
  placeholder?: string;
  value: string;
  autoFocus?: boolean;
  onInput: (value: string) => void;
}) {
  let inputEl: HTMLInputElement | undefined;
  onMount(() => {
    if (!props.autoFocus) return;
    // The Stepper's outin Transition resolves this step's JSX (firing
    // onMount) before attaching it to the document, so the input is still
    // detached here. Poll until it's connected, then focus.
    const focusWhenConnected = () => {
      if (!inputEl) return;
      if (inputEl.isConnected) inputEl.focus({ preventScroll: true });
      else requestAnimationFrame(focusWhenConnected);
    };
    focusWhenConnected();
  });
  return (
    <input
      ref={(el) => (inputEl = el)}
      id={props.id}
      name={props.id}
      type={props.type ?? 'text'}
      placeholder={props.placeholder}
      value={props.value}
      autocomplete={props.id}
      onInput={(e) => props.onInput(e.currentTarget.value)}
      class="ob2-input w-full px-4 py-3 rounded-lg border border-edge bg-surface text-sm text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none transition-colors"
    />
  );
}

function SkipButton(props: { label?: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      class="self-center text-ink-muted"
      onClick={props.onClick}
    >
      {props.label ?? 'Skip for now'}
    </Button>
  );
}

const isPlausibleEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());

/** Step 1 — capture email + team name. No auth code is sent yet. */
function WelcomeStep(props: {
  email: string;
  teamName: string;
  setEmail: (v: string) => void;
  setTeamName: (v: string) => void;
  onContinue: () => void;
}) {
  const valid = () =>
    isPlausibleEmail(props.email) && props.teamName.trim().length > 0;

  return (
    <form
      class="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        // TODO: kick off account creation / send the auth code here (the
        // code is only verified later, and only if no Google account gets
        // connected in the next step).
        if (valid()) props.onContinue();
      }}
    >
      <FormInput
        id="email"
        type="email"
        placeholder="you@company.com"
        value={props.email}
        autoFocus
        onInput={props.setEmail}
      />
      <FormInput
        id="team-name"
        placeholder="Team name"
        value={props.teamName}
        onInput={props.setTeamName}
      />
      <Button variant="cta" type="submit" disabled={!valid()}>
        Continue
        <ArrowRight class="size-4" />
      </Button>
    </form>
  );
}

/** Step 2 — connect work + personal Google accounts (up to four). */
function GoogleStep(props: {
  slots: GoogleSlot[];
  onConnect: (index: number) => void;
  onAddSlot: () => void;
  onContinue: () => void;
}) {
  const anyConnected = () => props.slots.some((s) => s.status === 'connected');

  return (
    <div class="flex flex-col gap-3">
      <Index each={props.slots}>
        {(slot, i) => (
          <Button
            variant="contrast"
            size="lg"
            class="ring ring-edge-muted"
            disabled={slot().status !== 'idle'}
            onClick={() => props.onConnect(i)}
          >
            <Show
              when={slot().status === 'connected'}
              fallback={
                <Show
                  when={slot().status === 'connecting'}
                  fallback={<IconGoogle />}
                >
                  <CircleNotch class="animate-spin" />
                </Show>
              }
            >
              <Check />
            </Show>
            {slot().status === 'connected'
              ? `${slot().label} account connected`
              : `Connect ${slot().label.toLowerCase()} account`}
          </Button>
        )}
      </Index>

      <Show when={props.slots.length < MAX_GOOGLE_ACCOUNTS}>
        <Button
          variant="ghost"
          size="sm"
          class="self-center text-ink-muted"
          onClick={props.onAddSlot}
        >
          <Plus class="size-4" />
          Add another Google account
        </Button>
      </Show>

      <Button
        variant="cta"
        disabled={!anyConnected()}
        onClick={props.onContinue}
      >
        Continue
        <ArrowRight class="size-4" />
      </Button>
      <SkipButton onClick={props.onContinue} />
      <Show when={!anyConnected()}>
        <p class="text-center text-xs text-ink-muted leading-snug">
          Skip this and we’ll verify your email with a one-time code instead.
        </p>
      </Show>
    </div>
  );
}

/** Steps 3–5 — one big connect button per tool (Linear, Notion, Slack). */
function ConnectorStep(props: {
  name: string;
  // A factory, not an element: the icon renders in two places at once (the
  // tile and the button), and a single JSX element is one DOM node that
  // would get moved between them instead of shown in both.
  icon: () => JSX.Element;
  status: ConnectStatus;
  onConnect: () => void;
  onContinue: () => void;
}) {
  return (
    <div class="flex flex-col gap-3">
      <div class="flex justify-center py-6">
        <div class="flex items-center justify-center size-20 rounded-2xl border border-edge-muted bg-surface [&_svg]:size-10">
          {props.icon()}
        </div>
      </div>

      <Show
        when={props.status !== 'connected'}
        fallback={
          <>
            <div class="flex items-center justify-center gap-2 py-3 text-sm text-success">
              <Check class="size-4" />
              {props.name} connected
            </div>
            <Button variant="cta" onClick={props.onContinue}>
              Continue
              <ArrowRight class="size-4" />
            </Button>
          </>
        }
      >
        <Button
          variant="cta"
          size="lg"
          disabled={props.status === 'connecting'}
          onClick={props.onConnect}
        >
          <Show when={props.status === 'connecting'} fallback={props.icon()}>
            <CircleNotch class="animate-spin" />
          </Show>
          Connect {props.name}
        </Button>
        <SkipButton onClick={props.onContinue} />
      </Show>
    </div>
  );
}

/**
 * Step 6 — mock "building your unified memory" animation. Pure theater:
 * cycles through the phrases on a timer, then advances. TODO: drive this
 * from real gather/indexing progress once the connectors are wired up.
 */
function BuildingStep(props: { onDone: () => void }) {
  const [phraseIndex, setPhraseIndex] = createSignal(0);

  onMount(() => {
    const interval = setInterval(() => {
      setPhraseIndex((i) => {
        if (i + 1 >= BUILDING_PHRASES.length) {
          clearInterval(interval);
          // Let the last phrase breathe before moving on.
          setTimeout(props.onDone, BUILDING_PHRASE_MS);
          return i;
        }
        return i + 1;
      });
    }, BUILDING_PHRASE_MS);
    onCleanup(() => clearInterval(interval));
  });

  const progress = () => ((phraseIndex() + 1) / BUILDING_PHRASES.length) * 100;

  return (
    <div class="flex flex-col items-center gap-10 py-10">
      <div class="relative flex items-center justify-center">
        <div class="ob2-ring absolute size-28 rounded-full border border-accent/40" />
        <div class="ob2-ring absolute size-28 rounded-full border border-accent/40 [animation-delay:900ms]" />
        <div class="ob2-ring absolute size-28 rounded-full border border-accent/40 [animation-delay:1800ms]" />
        <LogoIcon class="ob2-pulse size-16 text-accent" />
      </div>

      {/* Keyed so each phrase re-enters with the fade-up animation. */}
      <Show when={BUILDING_PHRASES[phraseIndex()]} keyed>
        {(phrase) => (
          <p class="ob2-phrase text-base text-ink text-center min-h-6">
            {phrase}
          </p>
        )}
      </Show>

      <div class="w-48 h-1 rounded-full bg-edge-muted overflow-hidden">
        <div
          class="h-full rounded-full bg-accent transition-all duration-1000 ease-linear"
          style={{ width: `${progress()}%` }}
        />
      </div>
    </div>
  );
}

/** Step 7 — free vs paid, presented side by side with equal weight. */
function PlanStep(props: {
  selected: PlanTier;
  setSelected: (tier: PlanTier) => void;
  onContinue: () => void;
}) {
  return (
    <div class="flex flex-col gap-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Index each={PLANS}>
          {(plan) => (
            <button
              type="button"
              onClick={() => props.setSelected(plan().tier)}
              class={cn(
                'flex flex-col gap-4 rounded-xl border p-5 text-left transition-colors cursor-pointer',
                props.selected === plan().tier
                  ? 'border-accent ring-1 ring-accent'
                  : 'border-edge hover:border-edge-muted'
              )}
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-semibold text-ink">
                  {plan().name}
                </span>
                <span
                  class={cn(
                    'flex items-center justify-center size-4 rounded-full border',
                    props.selected === plan().tier
                      ? 'border-accent bg-accent text-surface'
                      : 'border-edge'
                  )}
                >
                  <Show when={props.selected === plan().tier}>
                    <Check class="size-3" />
                  </Show>
                </span>
              </div>
              <div class="flex items-baseline gap-1">
                <span class="text-2xl font-semibold tracking-tight text-ink">
                  ${plan().price}
                </span>
                <span class="text-xs text-ink-muted">
                  {plan().price === 0 ? 'forever' : 'per user / month'}
                </span>
              </div>
              <ul class="flex flex-col gap-2">
                <Index each={PLAN_FEATURES}>
                  {(feature) => (
                    <li class="flex items-center justify-between gap-2 text-xs">
                      <span class="text-ink-muted">{feature().label}</span>
                      <span class="text-ink font-medium">
                        {feature().values[plan().tier]}
                      </span>
                    </li>
                  )}
                </Index>
              </ul>
            </button>
          )}
        </Index>
      </div>

      <Button variant="cta" onClick={props.onContinue}>
        {/* TODO: start checkout for premium here instead of just advancing. */}
        Continue with {props.selected === 'free' ? 'Free' : 'Premium'}
        <ArrowRight class="size-4" />
      </Button>
    </div>
  );
}

/** Step 8 — invite teammates. Invites are captured but not sent yet. */
function InviteStep(props: {
  invites: string[];
  setInvite: (index: number, value: string) => void;
  onAddInvite: () => void;
  onFinish: () => void;
}) {
  const validInvites = () => props.invites.filter(isPlausibleEmail);

  return (
    <div class="flex flex-col gap-3">
      <Index each={props.invites}>
        {(invite, i) => (
          <FormInput
            id={`invite-${i}`}
            type="email"
            placeholder="teammate@company.com"
            value={invite()}
            autoFocus={i === 0}
            onInput={(value) => props.setInvite(i, value)}
          />
        )}
      </Index>

      <Button
        variant="ghost"
        size="sm"
        class="self-center text-ink-muted"
        onClick={props.onAddInvite}
      >
        <Plus class="size-4" />
        Add another teammate
      </Button>

      <Button
        variant="cta"
        disabled={validInvites().length === 0}
        onClick={props.onFinish}
      >
        {/* TODO: actually send the invites (team-invitations backend). */}
        Send invites & enter Macro
        <ArrowRight class="size-4" />
      </Button>
      <SkipButton label="I'll invite people later" onClick={props.onFinish} />
    </div>
  );
}

export function Onboarding2() {
  const navigate = useNavigate();
  const [step, setStep] = createSignal<Ob2Step>(Ob2Step.Welcome);

  // Step 1 state — captured locally only for now.
  const [email, setEmail] = createSignal('');
  const [teamName, setTeamName] = createSignal('');

  // Step 2 state — Google account slots (work + personal, expandable to 4).
  const [googleSlots, setGoogleSlots] = createStore<GoogleSlot[]>([
    { label: 'Work', status: 'idle' },
    { label: 'Personal', status: 'idle' },
  ]);

  // Steps 3–5 state — tool connections.
  const [connectors, setConnectors] = createStore<
    Record<'linear' | 'notion' | 'slack', ConnectStatus>
  >({ linear: 'idle', notion: 'idle', slack: 'idle' });

  // Step 7–8 state.
  const [plan, setPlan] = createSignal<PlanTier>('free');
  const [invites, setInvites] = createSignal<string[]>(['', '', '']);

  /** TODO: replace with the real Google OAuth / add-inbox flow. */
  const connectGoogle = (index: number) => {
    setGoogleSlots(index, 'status', 'connecting');
    setTimeout(
      () => setGoogleSlots(index, 'status', 'connected'),
      MOCK_CONNECT_MS
    );
  };

  /** TODO: replace with each tool's real OAuth/connect flow. */
  const connectTool = (tool: 'linear' | 'notion' | 'slack') => {
    setConnectors(tool, 'connecting');
    setTimeout(() => setConnectors(tool, 'connected'), MOCK_CONNECT_MS);
  };

  const finish = () => {
    // TODO: persist everything (account, team, plan, invites) and, if no
    // Google account was connected, route through email code verification
    // before entering the app.
    navigate('/');
  };

  const goBack = () => {
    // Never step back "into" the building animation — jump over it.
    if (step() === Ob2Step.Plan) setStep(Ob2Step.Slack);
    else if (step() > Ob2Step.Welcome) setStep((step() - 1) as Ob2Step);
  };

  const showBack = () =>
    step() !== Ob2Step.Welcome && step() !== Ob2Step.Building;

  const header = createMemo(() => {
    switch (step()) {
      case Ob2Step.Welcome:
        return {
          title: 'Welcome to Macro',
          subtitle: 'Tell us where to reach you and what to call your team.',
        };
      case Ob2Step.Google:
        return {
          title: 'Connect your Google accounts',
          subtitle:
            'Macro builds one unified memory across everything you do. Connecting work and personal brings your email, docs, and calendar together — so nothing lives in a silo.',
        };
      case Ob2Step.Linear:
        return {
          title: 'Connect Linear',
          subtitle:
            'Link your issues to the emails, docs, and threads behind them — so your memory knows what’s shipping and why.',
        };
      case Ob2Step.Notion:
        return {
          title: 'Connect Notion',
          subtitle:
            'Bring your team’s docs and wikis into your unified memory, so answers surface even when they’re buried three pages deep.',
        };
      case Ob2Step.Slack:
        return {
          title: 'Connect Slack',
          subtitle:
            'Slack is where decisions happen. Connect it so your memory remembers what was decided — and who said what.',
        };
      case Ob2Step.Building:
        return { title: '', subtitle: '' };
      case Ob2Step.Plan:
        return {
          title: 'Choose your plan',
          subtitle: 'Start free, or go Premium. You can change this anytime.',
        };
      case Ob2Step.Invite:
        return {
          title: 'Invite your team',
          subtitle:
            'Macro is designed as a multiplayer tool — your unified memory gets sharper with every teammate who joins. You’ll also have a better onboarding experience together.',
        };
    }
  });

  return (
    <div class="flex items-center justify-center size-full overflow-hidden relative">
      <style>{
        /*css*/ `
        @keyframes ob2-card-in {
          from { opacity: 0; transform: translateY(14px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)    scale(1);     }
        }
        .ob2-card { animation: ob2-card-in 520ms cubic-bezier(0.22, 1, 0.36, 1) both; }

        @keyframes ob2-phrase-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .ob2-phrase { animation: ob2-phrase-in 400ms ease-out both; }

        @keyframes ob2-pulse {
          0%, 100% { transform: scale(1);    }
          50%      { transform: scale(1.06); }
        }
        .ob2-pulse { animation: ob2-pulse 2.7s ease-in-out infinite; }

        @keyframes ob2-ring {
          from { transform: scale(0.6); opacity: 0.8; }
          to   { transform: scale(1.8); opacity: 0;   }
        }
        .ob2-ring { animation: ob2-ring 2.7s ease-out infinite; }

        /* Override browser autofill yellow with our surface/ink palette */
        .ob2-input:-webkit-autofill,
        .ob2-input:-webkit-autofill:hover,
        .ob2-input:-webkit-autofill:focus,
        .ob2-input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px var(--color-surface) inset;
          -webkit-text-fill-color: var(--color-ink);
          caret-color: var(--color-ink);
          transition: background-color 5000s ease-in-out 0s;
        }
      `
      }</style>

      <div
        class={cn(
          'w-full ob2-card transition-[max-width] duration-300',
          step() === Ob2Step.Plan
            ? 'max-w-sm sm:max-w-xl'
            : 'max-w-sm sm:max-w-md'
        )}
      >
        <div class="px-4 sm:px-8 flex flex-col gap-10">
          <div class="flex flex-col gap-8">
            <Show when={step() !== Ob2Step.Building}>
              <div class="flex flex-col items-center text-center gap-3">
                <LogoIcon class="shrink-0 text-accent size-10" />
                <h1 class="font-semibold tracking-tight text-ink text-2xl">
                  {header().title}
                </h1>
                <Show when={header().subtitle}>
                  <p class="text-sm text-ink-muted leading-relaxed max-w-sm">
                    {header().subtitle}
                  </p>
                </Show>
              </div>
            </Show>

            <Stepper step={step()} transition={Stepper.transitions.scale}>
              <Stepper.Step>
                <WelcomeStep
                  email={email()}
                  teamName={teamName()}
                  setEmail={setEmail}
                  setTeamName={setTeamName}
                  onContinue={() => setStep(Ob2Step.Google)}
                />
              </Stepper.Step>
              <Stepper.Step>
                <GoogleStep
                  slots={googleSlots}
                  onConnect={connectGoogle}
                  onAddSlot={() =>
                    setGoogleSlots(googleSlots.length, {
                      label: googleSlots.length === 2 ? 'Third' : 'Fourth',
                      status: 'idle',
                    })
                  }
                  onContinue={() => setStep(Ob2Step.Linear)}
                />
              </Stepper.Step>
              <Stepper.Step>
                <ConnectorStep
                  name="Linear"
                  icon={() => <LinearIcon />}
                  status={connectors.linear}
                  onConnect={() => connectTool('linear')}
                  onContinue={() => setStep(Ob2Step.Notion)}
                />
              </Stepper.Step>
              <Stepper.Step>
                <ConnectorStep
                  name="Notion"
                  icon={() => <NotionIcon />}
                  status={connectors.notion}
                  onConnect={() => connectTool('notion')}
                  onContinue={() => setStep(Ob2Step.Slack)}
                />
              </Stepper.Step>
              <Stepper.Step>
                <ConnectorStep
                  name="Slack"
                  icon={() => <SlackIcon />}
                  status={connectors.slack}
                  onConnect={() => connectTool('slack')}
                  onContinue={() => setStep(Ob2Step.Building)}
                />
              </Stepper.Step>
              <Stepper.Step>
                <BuildingStep onDone={() => setStep(Ob2Step.Plan)} />
              </Stepper.Step>
              <Stepper.Step>
                <PlanStep
                  selected={plan()}
                  setSelected={setPlan}
                  onContinue={() => setStep(Ob2Step.Invite)}
                />
              </Stepper.Step>
              <Stepper.Step>
                <InviteStep
                  invites={invites()}
                  setInvite={(i, value) =>
                    setInvites((prev) =>
                      prev.map((v, j) => (j === i ? value : v))
                    )
                  }
                  onAddInvite={() => setInvites((prev) => [...prev, ''])}
                  onFinish={finish}
                />
              </Stepper.Step>
            </Stepper>
          </div>

          <div class="grid grid-cols-[1fr_auto_1fr] items-center">
            <div>
              <Show when={showBack()}>
                <Button
                  variant="ghost"
                  size="sm"
                  class="text-ink-muted justify-self-start"
                  onClick={goBack}
                >
                  <ArrowLeft class="size-4" />
                  Back
                </Button>
              </Show>
            </div>
            {/* Step dots — Building is a transition, not a stop, so it gets no dot. */}
            <div class="flex justify-center gap-1.5">
              <Index each={DOT_STEPS}>
                {(dotStep) => (
                  <div
                    class={cn(
                      'size-1.5 rounded-full transition-colors',
                      step() >= dotStep() ? 'bg-accent' : 'bg-edge-muted'
                    )}
                  />
                )}
              </Index>
            </div>
            <div />
          </div>
        </div>
      </div>
    </div>
  );
}
