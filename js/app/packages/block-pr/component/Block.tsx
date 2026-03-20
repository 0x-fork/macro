import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import {
  SplitHeaderBadge,
  StaticSplitLabel,
} from '@app/component/split-layout/components/SplitLabel';
import { DocumentBlockContainer } from '@core/component/DocumentBlockContainer';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { baseCommentTheme } from '@core/comments/Thread';
import { relativeTime } from '@core/util/relativeTime';
import { Button } from '@ui/components/Button';
import { createMemo, For, Match, Show, Switch } from 'solid-js';
import type { GithubPullRequestComment } from '@queries/github/transforms';
import { blockDataSignal } from '../signal/prBlockData';

function StatusBadge(props: { state: string; draft?: boolean }) {
  const palette = createMemo(() => {
    if (props.draft) {
      return 'bg-edge/10 text-ink-muted border-edge-muted';
    }
    switch (props.state) {
      case 'merged':
        return 'bg-accent/10 text-accent border-accent/20';
      case 'closed':
        return 'bg-edge/10 text-ink-muted border-edge-muted';
      default:
        return 'bg-success/10 text-success border-success/20';
    }
  });

  return (
    <span
      class={`inline-flex items-center rounded-xs border px-2 py-1 text-[0.625rem] font-mono uppercase tracking-wide ${palette()}`}
    >
      {props.draft ? 'Draft' : props.state}
    </span>
  );
}

function MetadataRow(props: { label: string; value: string | number | null }) {
  return (
    <div class="flex flex-col gap-1 rounded-xs border border-edge-muted/60 bg-panel px-3 py-2">
      <span class="text-[0.625rem] font-mono uppercase tracking-wide text-ink-extra-muted">
        {props.label}
      </span>
      <span class="text-sm text-ink">{props.value ?? 'None'}</span>
    </div>
  );
}

function Avatar(props: { login: string; avatarUrl?: string | null }) {
  return (
    <Show
      when={props.avatarUrl}
      fallback={
        <div class="size-8 rounded-full bg-edge-muted/70 flex items-center justify-center text-xs font-semibold uppercase text-ink">
          {props.login.slice(0, 1)}
        </div>
      }
    >
      {(avatarUrl) => (
        <img
          src={avatarUrl() ?? ''}
          alt={props.login}
          class="size-8 rounded-full bg-edge-muted/70 object-cover"
          loading="lazy"
        />
      )}
    </Show>
  );
}

function CommentTypeBadge(props: { comment: GithubPullRequestComment }) {
  const label = () => {
    switch (props.comment.kind) {
      case 'issue_comment':
        return 'Comment';
      case 'review':
        return props.comment.state;
      case 'review_comment':
        return 'Review comment';
    }
  };

  return (
    <span class="rounded-xs border border-edge-muted px-1.5 py-0.5 text-[0.625rem] font-mono uppercase tracking-wide text-ink-muted">
      {label()}
    </span>
  );
}

function CommentBody(props: { comment: GithubPullRequestComment }) {
  return (
    <Switch>
      <Match
        when={
          (props.comment.kind === 'issue_comment' ||
            props.comment.kind === 'review_comment') &&
          props.comment.body.trim().length > 0
        }
      >
        <StaticMarkdown markdown={props.comment.body ?? ''} />
      </Match>
      <Match
        when={
          props.comment.kind === 'review' &&
          (props.comment.body?.trim().length ?? 0) > 0
        }
      >
        <StaticMarkdown markdown={props.comment.body ?? ''} />
      </Match>
    </Switch>
  );
}

function TimelineComment(props: { comment: GithubPullRequestComment }) {
  const authorAssociation = () => {
    if (
      props.comment.kind === 'issue_comment' ||
      props.comment.kind === 'review_comment'
    ) {
      return props.comment.authorAssociation;
    }

    return undefined;
  };

  const reviewLocation = () => {
    if (props.comment.kind !== 'review_comment') return undefined;

    return {
      path: props.comment.path,
      line: props.comment.line,
      diffHunk: props.comment.diffHunk,
    };
  };

  return (
    <div class="rounded-sm border border-edge-muted/60 bg-panel px-3 py-3">
      <div class="flex items-start gap-3">
        <Avatar
          login={props.comment.authorLogin}
          avatarUrl={props.comment.authorAvatarUrl}
        />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold text-ink">
              {props.comment.authorLogin}
            </span>
            <CommentTypeBadge comment={props.comment} />
            <Show when={authorAssociation()}>
              <span class="text-[0.625rem] font-mono uppercase tracking-wide text-ink-extra-muted">
                {authorAssociation()}
              </span>
            </Show>
            <a
              href={props.comment.htmlUrl}
              target="_blank"
              rel="noreferrer"
              class="text-xs text-accent hover:underline"
            >
              {relativeTime(String(props.comment.createdAt))}
            </a>
          </div>

          <Show
            when={
              reviewLocation() &&
              (reviewLocation()!.path || reviewLocation()!.line)
            }
          >
            <div class="mt-2 text-xs font-mono text-ink-extra-muted">
              {reviewLocation()!.path}
              <Show when={reviewLocation()!.line}>
                :{reviewLocation()!.line}
              </Show>
            </div>
          </Show>

          <div class="mt-2 text-sm text-ink">
            <CommentBody comment={props.comment} />
          </div>

          <Show
            when={
              reviewLocation()?.diffHunk?.trim()
            }
          >
            <pre class="mt-3 overflow-x-auto rounded-xs bg-page px-3 py-2 text-xs text-ink-muted whitespace-pre-wrap">
              {reviewLocation()!.diffHunk}
            </pre>
          </Show>
        </div>
      </div>
    </div>
  );
}

export default function BlockPr() {
  const data = blockDataSignal.get;

  return (
    <DocumentBlockContainer title={data()?.name}>
      <div class="w-full h-full bg-panel overflow-hidden flex flex-col">
        <SplitHeaderLeft>
          <StaticSplitLabel
            iconType="code"
            label={data()?.name ?? 'Pull Request'}
            badges={
              data()
                ? [
                    <SplitHeaderBadge text={data()!.repoFullName} />,
                    <StatusBadge
                      state={data()!.state}
                      draft={data()!.isDraft}
                    />,
                  ]
                : undefined
            }
          />
        </SplitHeaderLeft>
        <SplitHeaderRight>
          <Show when={data()?.htmlUrl}>
            {(htmlUrl) => (
              <Button
                as="a"
                href={htmlUrl()}
                target="_blank"
                rel="noreferrer"
                size="sm"
                variant="ghost"
                class="rounded-xs"
              >
                Open in GitHub
              </Button>
            )}
          </Show>
        </SplitHeaderRight>

        <div class="flex-1 overflow-auto">
          <Show when={data()}>
            {(pullRequest) => (
              <StaticMarkdownContext theme={baseCommentTheme}>
                <div class="mx-auto w-full max-w-4xl px-4 py-4 flex flex-col gap-4">
                  <div class="rounded-sm border border-edge-muted/60 bg-panel px-4 py-4 flex flex-col gap-3">
                    <div class="flex items-start gap-3">
                      <Avatar
                        login={pullRequest().authorLogin}
                        avatarUrl={pullRequest().authorAvatarUrl}
                      />
                      <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <h1 class="text-xl font-semibold text-ink">
                            {pullRequest().name}
                          </h1>
                          <StatusBadge
                            state={pullRequest().state}
                            draft={pullRequest().isDraft}
                          />
                        </div>
                        <div class="mt-1 text-sm text-ink-muted">
                          #{pullRequest().number} opened by{' '}
                          <span class="font-medium text-ink">
                            {pullRequest().authorLogin}
                          </span>{' '}
                          in {pullRequest().repoFullName}
                        </div>
                      </div>
                    </div>

                    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <MetadataRow
                        label="Branches"
                        value={`${pullRequest().headBranch} -> ${pullRequest().baseBranch}`}
                      />
                      <MetadataRow
                        label="Changes"
                        value={`${pullRequest().additions} + / ${pullRequest().deletions} -`}
                      />
                      <MetadataRow
                        label="Files"
                        value={pullRequest().changedFiles}
                      />
                      <MetadataRow
                        label="Commits"
                        value={pullRequest().commits}
                      />
                      <MetadataRow
                        label="Comments"
                        value={pullRequest().commentCount}
                      />
                      <MetadataRow
                        label="Created"
                        value={relativeTime(String(pullRequest().createdAt ?? ''))}
                      />
                      <MetadataRow
                        label="Updated"
                        value={relativeTime(String(pullRequest().updatedAt ?? ''))}
                      />
                      <MetadataRow
                        label="Merged"
                        value={
                          pullRequest().mergedAt
                            ? relativeTime(String(pullRequest().mergedAt))
                            : null
                        }
                      />
                    </div>

                    <Show when={pullRequest().labels.length > 0}>
                      <div class="flex flex-wrap gap-2">
                        <For each={pullRequest().labels}>
                          {(label) => (
                            <span class="rounded-xs border border-edge-muted px-2 py-1 text-xs text-ink-muted">
                              {label}
                            </span>
                          )}
                        </For>
                      </div>
                    </Show>

                    <Show when={pullRequest().requestedReviewers.length > 0}>
                      <div class="text-sm text-ink-muted">
                        Requested reviewers:{' '}
                        <span class="text-ink">
                          {pullRequest().requestedReviewers.join(', ')}
                        </span>
                      </div>
                    </Show>

                    <Show when={pullRequest().body?.trim()}>
                      <div class="rounded-xs bg-page px-4 py-3 text-sm text-ink">
                        <StaticMarkdown markdown={pullRequest().body ?? ''} />
                      </div>
                    </Show>
                  </div>

                  <div class="flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                      <h2 class="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                        Timeline
                      </h2>
                      <span class="text-xs text-ink-extra-muted">
                        {pullRequest().comments.length} entries
                      </span>
                    </div>
                    <Show
                      when={pullRequest().comments.length > 0}
                      fallback={
                        <div class="rounded-sm border border-edge-muted/60 bg-panel px-4 py-6 text-sm text-ink-muted">
                          No comments on this pull request.
                        </div>
                      }
                    >
                      <div class="flex flex-col gap-3">
                        <For each={pullRequest().comments}>
                          {(comment) => <TimelineComment comment={comment} />}
                        </For>
                      </div>
                    </Show>
                  </div>
                </div>
              </StaticMarkdownContext>
            )}
          </Show>
        </div>
      </div>
    </DocumentBlockContainer>
  );
}
