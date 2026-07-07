import { SidePanel } from '@app/component/side-panel';
import { toast } from '@core/component/Toast/Toast';
import { useSettingsState } from '@core/constant/SettingsState';
import GithubIcon from '@icon/mcp-github.svg';
import ChartBarIcon from '@phosphor/chart-bar.svg';
import ChartLineUpIcon from '@phosphor/chart-line-up.svg';
import CheckSquareIcon from '@phosphor/check-square.svg';
import ClockIcon from '@phosphor/clock.svg';
import GitPullRequestIcon from '@phosphor/git-pull-request.svg';
import LightningIcon from '@phosphor/lightning.svg';
import ShieldCheckIcon from '@phosphor/shield-check.svg';
import UsersThreeIcon from '@phosphor/users-three.svg';
import { useInitGithubLinkMutation } from '@queries/auth';
import { Button, cn } from '@ui';
import { createUniqueId, For, type JSX } from 'solid-js';
import { DonutChart, ThroughputChart } from './charts';
import type { WeeklyPrActivity } from './model';
import { TASK_STATUS_SEGMENTS } from './widgets';

/**
 * Empty state for the codebase overview when GitHub isn't connected: a
 * connect hero, skeleton previews of what the view will show, and preview
 * sections for the insights side rail.
 */

/** Fabricated rising throughput so the preview charts look alive. */
const PREVIEW_WEEKS: WeeklyPrActivity[] = [
  [1, 0],
  [1, 1],
  [2, 1],
  [2, 2],
  [3, 2],
  [4, 3],
  [6, 5],
  [8, 7],
].map(([opened, merged]) => ({
  weekStart: new Date(0),
  label: '',
  opened,
  merged,
}));

const PREVIEW_TASK_SEGMENTS = TASK_STATUS_SEGMENTS.map((segment, index) => ({
  ...segment,
  count: [7, 3, 4, 6, 2][index] ?? 1,
}));

/** Skeleton bar. */
function Bone(props: { class?: string; width?: string }) {
  return (
    <div
      class={cn('rounded-full bg-ink/6', props.class)}
      style={props.width ? { width: props.width } : undefined}
    />
  );
}

function AvatarBone() {
  return <div class="size-5 shrink-0 rounded-full bg-ink/8" />;
}

/** Static hero graphic: glowing GitHub mark inside a dashed orbit. */
function GithubOrbit() {
  const uid = createUniqueId();
  return (
    <div class="relative flex h-36 w-64 items-center justify-center">
      <svg
        class="absolute inset-0 size-full text-edge"
        viewBox="0 0 256 144"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={`glow-${uid}`}>
            <stop
              offset="0%"
              stop-color="var(--color-accent)"
              stop-opacity="0.35"
            />
            <stop
              offset="70%"
              stop-color="var(--color-accent)"
              stop-opacity="0.06"
            />
            <stop
              offset="100%"
              stop-color="var(--color-accent)"
              stop-opacity="0"
            />
          </radialGradient>
        </defs>
        <circle cx="128" cy="72" r="64" fill={`url(#glow-${uid})`} />
        <ellipse
          cx="128"
          cy="72"
          rx="118"
          ry="46"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          stroke-dasharray="2 5"
        />
        <ellipse
          cx="128"
          cy="72"
          rx="86"
          ry="32"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          stroke-dasharray="2 5"
          opacity="0.6"
        />
        {/* Sparkles */}
        <For
          each={[
            [30, 40],
            [224, 34],
            [46, 108],
            [206, 104],
          ]}
        >
          {([x, y]) => (
            <path
              d={`M ${x} ${y - 4} L ${x + 1.2} ${y - 1.2} L ${x + 4} ${y} L ${x + 1.2} ${y + 1.2} L ${x} ${y + 4} L ${x - 1.2} ${y + 1.2} L ${x - 4} ${y} L ${x - 1.2} ${y - 1.2} Z`}
              fill="var(--color-accent)"
              opacity="0.7"
            />
          )}
        </For>
      </svg>
      <div class="relative flex size-16 items-center justify-center rounded-full bg-ink/90 text-surface shadow-lg [&_svg]:size-9">
        <GithubIcon class="text-surface" />
      </div>
    </div>
  );
}

function FeatureCard(props: {
  icon: (iconProps: { class?: string }) => JSX.Element;
  label: string;
  children: JSX.Element;
}) {
  return (
    <div class="flex min-w-0 flex-col gap-3 rounded-xl bg-surface/50 p-3.5 ring ring-edge-muted ring-inset">
      <div class="flex items-center gap-2.5">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          {props.icon({ class: 'size-4' })}
        </span>
        <span class="text-[13px] font-medium text-ink">{props.label}</span>
      </div>
      {props.children}
    </div>
  );
}

/** Tiny static area curve for the throughput feature card. */
function MiniAreaPreview() {
  const uid = createUniqueId();
  return (
    <svg viewBox="0 0 200 84" class="w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`mini-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stop-color="var(--color-accent)"
            stop-opacity="0.3"
          />
          <stop
            offset="100%"
            stop-color="var(--color-accent)"
            stop-opacity="0"
          />
        </linearGradient>
      </defs>
      <path
        d="M 4 72 C 30 70, 44 62, 62 60 C 84 57, 92 44, 112 42 C 132 40, 140 24, 160 18 C 174 14, 186 10, 196 8 L 196 80 L 4 80 Z"
        fill={`url(#mini-${uid})`}
      />
      <path
        d="M 4 72 C 30 70, 44 62, 62 60 C 84 57, 92 44, 112 42 C 132 40, 140 24, 160 18 C 174 14, 186 10, 196 8"
        fill="none"
        stroke="var(--color-accent)"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        d="M 4 76 C 34 75, 52 70, 76 68 C 104 66, 128 58, 152 54 C 168 51, 184 48, 196 46"
        fill="none"
        stroke="var(--color-ink-extra-muted)"
        stroke-width="1.5"
        stroke-linecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

function SkeletonRows(props: { rows: number; withAvatar?: boolean }) {
  return (
    <div class="flex flex-col gap-2.5">
      <For each={Array.from({ length: props.rows })}>
        {(_, index) => (
          <div class="flex items-center gap-2">
            {props.withAvatar ? (
              <AvatarBone />
            ) : (
              <div class="size-2 shrink-0 rounded-full bg-ink/10" />
            )}
            <Bone
              class={cn('h-2 flex-1', index() % 2 === 1 && 'max-w-[75%]')}
            />
          </div>
        )}
      </For>
    </div>
  );
}

/** Main-column empty state (hero + feature previews). */
export function ConnectGithubOverview() {
  const { openSettings } = useSettingsState();
  const initGithubLink = useInitGithubLinkMutation();

  const handleConnect = async () => {
    try {
      window.location.href = await initGithubLink.mutateAsync(
        window.location.href
      );
    } catch {
      toast.failure('Failed to start GitHub connect flow');
    }
  };

  return (
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 @container">
      {/* Hero */}
      <section class="flex flex-col items-center gap-1 rounded-xl border border-dashed border-edge px-6 py-10 text-center">
        <GithubOrbit />
        <h2 class="mt-2 text-xl font-semibold text-ink">
          Connect GitHub to see your codebase
        </h2>
        <p class="max-w-md text-sm text-ink-muted">
          Macro will pull in your pull requests, tasks, throughput, and team
          activity—so you can stay aligned and ship faster.
        </p>
        <div class="mt-5 flex items-center gap-2.5">
          <Button
            variant="base"
            class="gap-2 rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover [&_svg]:size-4"
            onClick={() => void handleConnect()}
            disabled={initGithubLink.isPending}
          >
            <GithubIcon />
            Connect GitHub
          </Button>
          <Button
            variant="base"
            class="rounded-lg px-4 py-2 text-ink"
            onClick={() => openSettings('GitHub')}
          >
            Learn more
          </Button>
        </div>
      </section>

      {/* Feature previews */}
      <div class="flex flex-col gap-3">
        <span class="text-sm font-medium text-ink-muted">
          Here's what you'll get after connecting
        </span>
        <div class="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          <FeatureCard
            icon={(p) => <GitPullRequestIcon class={p.class} />}
            label="Pull requests"
          >
            <SkeletonRows rows={3} withAvatar />
          </FeatureCard>
          <FeatureCard
            icon={(p) => <CheckSquareIcon class={p.class} />}
            label="Tasks"
          >
            <SkeletonRows rows={4} />
          </FeatureCard>
          <FeatureCard
            icon={(p) => <ChartBarIcon class={p.class} />}
            label="Throughput"
          >
            <MiniAreaPreview />
          </FeatureCard>
          <FeatureCard
            icon={(p) => <UsersThreeIcon class={p.class} />}
            label="Team activity"
          >
            <div class="flex flex-col gap-2.5">
              <For each={[0, 1, 2]}>
                {() => (
                  <div class="flex items-start gap-2">
                    <AvatarBone />
                    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                      <Bone class="h-2 w-full" />
                      <Bone class="h-2 max-w-[60%]" />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </FeatureCard>
        </div>
      </div>

      {/* Recent activity skeleton */}
      <section class="flex flex-col gap-4 rounded-xl bg-surface/50 p-4 ring ring-edge-muted ring-inset">
        <div class="flex items-center gap-2.5">
          <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <LightningIcon class="size-4" />
          </span>
          <span class="text-[13px] font-medium text-ink">Recent activity</span>
        </div>
        <div class="flex flex-col gap-3.5">
          <For each={['92%', '78%', '85%', '64%']}>
            {(width) => (
              <div class="flex items-center gap-3">
                <AvatarBone />
                <div class="flex-1">
                  <Bone class="h-2" width={width} />
                </div>
                <Bone class="h-2 w-16 shrink-0" />
              </div>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}

const RAIL_METRIC_ICONS = [
  (p: { class?: string }) => <GitPullRequestIcon class={p.class} />,
  (p: { class?: string }) => <ClockIcon class={p.class} />,
  (p: { class?: string }) => <ChartLineUpIcon class={p.class} />,
  (p: { class?: string }) => <ShieldCheckIcon class={p.class} />,
];

function PreviewTitle(props: { label: string }) {
  return (
    <>
      {props.label}{' '}
      <span class="font-normal text-ink-extra-muted">(preview)</span>
    </>
  );
}

/** Side-rail preview sections shown while GitHub is disconnected. */
export function ConnectGithubRailSections() {
  return (
    <>
      <SidePanel.Section
        id="codebase-preview-throughput"
        title={<PreviewTitle label="Throughput" />}
        defaultOpen
        order={1}
      >
        <div class="pointer-events-none select-none" aria-hidden="true">
          <ThroughputChart data={PREVIEW_WEEKS} />
        </div>
      </SidePanel.Section>
      <SidePanel.Section
        id="codebase-preview-key-metrics"
        title={<PreviewTitle label="Key metrics" />}
        defaultOpen
        order={2}
      >
        <div class="grid grid-cols-2 gap-2 py-1">
          <For each={RAIL_METRIC_ICONS}>
            {(icon) => (
              <div class="flex items-center gap-2.5 rounded-xl bg-ink/3 p-3.5">
                <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                  {icon({ class: 'size-4' })}
                </span>
                <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Bone class="h-2 w-full" />
                  <Bone class="h-2 max-w-[65%]" />
                </div>
              </div>
            )}
          </For>
        </div>
      </SidePanel.Section>
      <SidePanel.Section
        id="codebase-preview-task-statuses"
        title={<PreviewTitle label="Task statuses" />}
        defaultOpen
        order={3}
      >
        <div
          class="pointer-events-none flex select-none flex-col items-center gap-3 py-1"
          aria-hidden="true"
        >
          <DonutChart
            segments={PREVIEW_TASK_SEGMENTS}
            centerValue=""
            centerCaption=""
            ariaLabel="Task statuses preview"
          />
          <div class="flex w-full max-w-52 flex-col gap-2">
            <For each={PREVIEW_TASK_SEGMENTS.slice(0, 5)}>
              {(segment, index) => (
                <div class="flex items-center gap-2">
                  <span
                    class="size-2 shrink-0 rounded-full"
                    style={{ 'background-color': segment.color }}
                  />
                  <Bone
                    class={cn('h-2 flex-1', index() % 2 === 1 && 'max-w-[70%]')}
                  />
                </div>
              )}
            </For>
          </div>
        </div>
      </SidePanel.Section>
    </>
  );
}
