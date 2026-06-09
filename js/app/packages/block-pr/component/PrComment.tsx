import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import ArrowSquareOut from '@phosphor/arrow-square-out.svg';
import type { GithubPullRequestComment } from '@service-storage/generated/schemas';
import { Layer } from '@ui';
import { format } from 'date-fns';
import { Show } from 'solid-js';
import { sanitizeCommentMarkdown } from '../utils';

function sourceLabel(source: string): string {
  switch (source) {
    case 'review':
      return 'reviewed';
    case 'review_comment':
      return 'commented on code';
    case 'issue_comment':
      return 'commented';
    default:
      return 'commented';
  }
}

function formatWhen(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'MMM d, yyyy · h:mm a');
}

export function PrComment(props: { comment: GithubPullRequestComment }) {
  const when = () => formatWhen(props.comment.createdAt);
  const body = () => sanitizeCommentMarkdown(props.comment.body ?? '');

  return (
    <Layer depth={1}>
      <div class="overflow-hidden rounded-lg border border-edge-muted/60 bg-surface">
        <div class="flex items-center gap-2 border-b border-edge-muted/60 px-3 py-2 text-xs">
          <span class="font-medium text-ink">
            {props.comment.authorLogin ?? 'Someone'}
          </span>
          <span class="text-ink-muted">
            {sourceLabel(props.comment.source)}
          </span>
          <Show when={when()}>
            {(w) => <span class="text-ink-extra-muted">· {w()}</span>}
          </Show>
          <Show when={props.comment.url}>
            {(url) => (
              <a
                href={url()}
                target="_blank"
                rel="noopener noreferrer"
                class="ml-auto shrink-0 text-ink-extra-muted hover:text-ink"
                aria-label="Open comment on GitHub"
              >
                <ArrowSquareOut class="size-3.5" />
              </a>
            )}
          </Show>
        </div>
        <Show
          when={body()}
          fallback={
            <div class="px-3 py-2 text-sm italic text-ink-faint">
              No comment body.
            </div>
          }
        >
          {(text) => (
            <div class="px-3 py-2 text-sm/6 text-ink text-pretty">
              <StaticMarkdown markdown={text()} target="external" />
            </div>
          )}
        </Show>
      </div>
    </Layer>
  );
}
