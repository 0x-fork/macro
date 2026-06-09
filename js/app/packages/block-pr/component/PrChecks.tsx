import ArrowSquareOut from '@phosphor/arrow-square-out.svg';
import Check from '@phosphor/check.svg';
import CircleDashed from '@phosphor/circle-dashed.svg';
import X from '@phosphor/x.svg';
import type { GithubPullRequestCheckRun } from '@service-storage/generated/schemas';
import { cn } from '@ui';
import { type Component, type JSX, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';

type CheckState = 'success' | 'failure' | 'pending' | 'neutral';

const FAILURE_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
  'stale',
]);
const NEUTRAL_CONCLUSIONS = new Set(['neutral', 'skipped']);

function checkState(check: GithubPullRequestCheckRun): CheckState {
  const status = (check.status ?? '').toLowerCase();
  if (status && status !== 'completed') return 'pending';

  const conclusion = (check.conclusion ?? '').toLowerCase();
  if (conclusion === 'success') return 'success';
  if (FAILURE_CONCLUSIONS.has(conclusion)) return 'failure';
  if (NEUTRAL_CONCLUSIONS.has(conclusion)) return 'neutral';
  return conclusion ? 'neutral' : 'pending';
}

const STATE_META: Record<
  CheckState,
  { icon: Component<JSX.SvgSVGAttributes<SVGSVGElement>>; class: string }
> = {
  success: { icon: Check, class: 'text-success' },
  failure: { icon: X, class: 'text-failure' },
  pending: { icon: CircleDashed, class: 'text-ink-muted' },
  neutral: { icon: CircleDashed, class: 'text-ink-muted' },
};

function checkLabel(check: GithubPullRequestCheckRun): string {
  const status = (check.status ?? '').toLowerCase();
  if (status && status !== 'completed') return status.replace(/_/g, ' ');
  return (check.conclusion ?? 'completed').replace(/_/g, ' ');
}

export function PrCheckRow(props: { check: GithubPullRequestCheckRun }) {
  const state = () => checkState(props.check);
  const meta = () => STATE_META[state()];

  return (
    <div class="flex items-center gap-2.5 px-3 py-2 text-sm">
      <span class={cn('shrink-0', meta().class)}>
        <Dynamic component={meta().icon} class="size-4" />
      </span>
      <span class="min-w-0 flex-1 truncate text-ink" title={props.check.name}>
        {props.check.name}
      </span>
      <span class="shrink-0 text-xs capitalize text-ink-muted">
        {checkLabel(props.check)}
      </span>
      <Show when={props.check.url}>
        {(url) => (
          <a
            href={url()}
            target="_blank"
            rel="noopener noreferrer"
            class="shrink-0 text-ink-extra-muted hover:text-ink"
            aria-label={`Open ${props.check.name} on GitHub`}
          >
            <ArrowSquareOut class="size-3.5" />
          </a>
        )}
      </Show>
    </div>
  );
}
