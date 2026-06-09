import GitMerge from '@phosphor/git-merge.svg';
import GitPullRequest from '@phosphor/git-pull-request.svg';
import { cn } from '@ui';
import type { Component, JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { PR_STATUS_META, type PullRequestStatus } from '../utils';

const STATUS_ICON: Record<
  PullRequestStatus,
  Component<JSX.SvgSVGAttributes<SVGSVGElement>>
> = {
  open: GitPullRequest,
  merged: GitMerge,
  closed: GitPullRequest,
};

export function PrStatusBadge(props: {
  status: PullRequestStatus;
  class?: string;
}) {
  const meta = () => PR_STATUS_META[props.status];
  return (
    <span
      class={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none',
        meta().badgeClass,
        props.class
      )}
    >
      <Dynamic component={STATUS_ICON[props.status]} class="size-3.5" />
      <span>{meta().label}</span>
    </span>
  );
}
