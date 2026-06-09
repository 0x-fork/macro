import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { aiChatTheme } from '@core/component/LexicalMarkdown/theme';
import { openExternalUrl } from '@core/util/url';
import GithubIcon from '@icon/mcp-github.svg';
import ArrowSquareOut from '@phosphor/arrow-square-out.svg';
import { Button } from '@ui';
import { type Accessor, createMemo, createSignal, For, Show } from 'solid-js';
import { hasLineChanges, type PullRequestMetadata } from '../utils';
import { PrComment } from './PrComment';
import { PrStatusBadge } from './PrStatusBadge';
import { PullRequestSplitHeader } from './PullRequestSplitHeader';

function commentTimestamp(value?: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function PullRequestBody(props: {
  metadata: Accessor<PullRequestMetadata>;
}) {
  const [scrollRef, setScrollRef] = createSignal<HTMLDivElement>();
  const metadata = props.metadata;

  const comments = createMemo(() =>
    [...metadata().comments].sort(
      (a, b) => commentTimestamp(a.createdAt) - commentTimestamp(b.createdAt)
    )
  );

  return (
    <>
      <PullRequestSplitHeader metadata={metadata} />
      <div class="relative min-h-0 flex-1 overflow-hidden">
        <div
          class="h-full min-h-0 overflow-y-auto scrollbar-hidden"
          ref={setScrollRef}
        >
          <div class="mx-auto min-w-0 max-w-3xl px-6 pt-10 pb-16">
            <div class="flex flex-col gap-10">
              <header class="flex flex-col gap-4">
                <div class="flex items-start gap-3">
                  <h1 class="min-w-0 flex-1 text-balance text-2xl font-semibold text-ink">
                    {metadata().name}
                  </h1>
                  <PrStatusBadge status={metadata().status} class="mt-1" />
                </div>

                <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                  <span class="font-mono">
                    {metadata().owner}/{metadata().repo}
                  </span>
                  <span class="text-ink-extra-muted">#{metadata().number}</span>
                  <Show when={hasLineChanges(metadata())}>
                    <span class="text-ink-extra-muted">·</span>
                    <span class="font-mono tabular-nums">
                      <span class="text-success">+{metadata().additions}</span>
                      <span class="mx-0.5 text-ink-extra-muted">/</span>
                      <span class="text-failure">-{metadata().deletions}</span>
                    </span>
                  </Show>
                </div>

                <div class="flex flex-col gap-1.5">
                  <Button
                    variant="base"
                    size="md"
                    class="w-fit gap-2"
                    onClick={() => openExternalUrl(metadata().url)}
                  >
                    <GithubIcon class="size-4" />
                    <span>Open in GitHub</span>
                    <ArrowSquareOut class="size-3.5 text-ink-muted" />
                  </Button>
                  <p class="text-xs text-ink-faint">
                    View the full diff and conversation on GitHub.
                  </p>
                </div>
              </header>

              <section class="flex flex-col gap-3">
                <h3 class="text-sm font-semibold text-ink">
                  Conversation
                  <Show when={comments().length > 0}>
                    <span class="font-normal text-ink-extra-muted">
                      {' '}
                      ({comments().length})
                    </span>
                  </Show>
                </h3>
                <Show
                  when={comments().length > 0}
                  fallback={
                    <div class="rounded-lg border border-dashed border-edge-muted/70 px-4 py-6 text-center text-sm text-ink-faint">
                      No comments yet.
                    </div>
                  }
                >
                  <StaticMarkdownContext theme={aiChatTheme}>
                    <div class="flex flex-col gap-3">
                      <For each={comments()}>
                        {(comment) => <PrComment comment={comment} />}
                      </For>
                    </div>
                  </StaticMarkdownContext>
                </Show>
              </section>
            </div>
          </div>
        </div>
        <CustomScrollbar scrollContainer={scrollRef} />
      </div>
    </>
  );
}
