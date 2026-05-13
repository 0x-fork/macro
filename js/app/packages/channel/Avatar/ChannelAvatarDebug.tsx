import { useQueryClient } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';

import { ChannelAvatar } from './ChannelAvatar';
import { COLOR_FAMILIES, COLOR_PALETTE } from './palette';
import { ICON_NAMES } from './icons';
import { channelAvatarQueryKey, useChannelAvatarQuery } from './query';

const FIXTURE_NAMES = [
  // Obvious topics
  'design',
  'engineering',
  'marketing',
  'music',
  'cooking',
  'gaming',
  'pets',
  'finance',
  'product',
  'sales',
  // Generic
  'general',
  'random',
  'team',
  'off-topic',
  'announcements',
  // Codenames
  'project-falcon',
  'operation-blue-sky',
  // Gibberish
  'asdf',
  'xyzzy',
  'aaaaa',
  // Non-English
  '日本語',
  'café',
  'москва',
  // Edge
  'a',
  '',
];

function Section(props: { title: string; children: any }) {
  return (
    <div class="space-y-3">
      <h2 class="text-sm font-semibold text-ink-muted uppercase tracking-wide">
        {props.title}
      </h2>
      {props.children}
    </div>
  );
}

function ResultRow(props: { name: string }) {
  const query = useChannelAvatarQuery(() => props.name);

  return (
    <div class="flex items-center gap-3 text-sm">
      <div class="size-8">
        <ChannelAvatar name={props.name} size="fill" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-ink font-medium truncate">
          {props.name || <span class="text-ink-extra-muted">(empty)</span>}
        </div>
        <div class="text-xs text-ink-muted font-mono">
          <Show
            when={query.data}
            fallback={
              <Show when={query.isFetching} fallback="fallback (hash)">
                loading…
              </Show>
            }
          >
            icon=<span class="text-ink">{query.data!.icon}</span> color=
            <span class="text-ink">{query.data!.colorFamily}</span>
          </Show>
        </div>
      </div>
    </div>
  );
}

export default function ChannelAvatarDebug() {
  const [input, setInput] = createSignal('design-team');
  const [submitted, setSubmitted] = createSignal('design-team');
  const queryClient = useQueryClient();

  const submittedQuery = useChannelAvatarQuery(submitted);

  const regenerate = () => {
    queryClient.removeQueries({
      queryKey: channelAvatarQueryKey(submitted()),
    });
  };

  return (
    <div class="p-8 space-y-12 bg-surface min-h-full overflow-auto">
      <div>
        <h1 class="text-xl font-bold text-ink mb-2">Channel Avatar Debug</h1>
        <p class="text-sm text-ink-muted">
          Type a channel name to see the generated avatar. Results are cached
          per name (IndexedDB, 90-day TTL) — use "Regenerate" to clear the cache
          and re-call the LLM.
        </p>
      </div>

      <Section title="Try a name">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(input());
          }}
          class="flex items-center gap-3"
        >
          <input
            type="text"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            placeholder="channel name"
            class="flex-1 max-w-sm px-3 py-2 rounded border border-edge-muted bg-page text-ink text-sm"
          />
          <button
            type="submit"
            class="px-3 py-2 rounded bg-accent text-on-accent text-sm font-medium"
          >
            Generate
          </button>
          <button
            type="button"
            onClick={regenerate}
            class="px-3 py-2 rounded border border-edge-muted text-ink text-sm"
          >
            Regenerate (clear cache)
          </button>
        </form>

        <div class="flex items-center gap-6 mt-6">
          <div class="flex flex-col items-center gap-1">
            <div class="size-4">
              <ChannelAvatar name={submitted()} size="fill" />
            </div>
            <span class="text-xs text-ink-extra-muted font-mono">16</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="size-6">
              <ChannelAvatar name={submitted()} size="fill" />
            </div>
            <span class="text-xs text-ink-extra-muted font-mono">24</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="size-10">
              <ChannelAvatar name={submitted()} size="fill" />
            </div>
            <span class="text-xs text-ink-extra-muted font-mono">40</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="size-16">
              <ChannelAvatar name={submitted()} size="fill" />
            </div>
            <span class="text-xs text-ink-extra-muted font-mono">64</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="size-24">
              <ChannelAvatar name={submitted()} size="fill" />
            </div>
            <span class="text-xs text-ink-extra-muted font-mono">96</span>
          </div>
        </div>

        <div class="mt-4 text-sm font-mono text-ink-muted">
          <Show
            when={submittedQuery.data}
            fallback={
              <Show when={submittedQuery.isFetching} fallback="(rendering hash fallback)">
                loading from LLM…
              </Show>
            }
          >
            picked icon=<span class="text-ink">{submittedQuery.data!.icon}</span>{' '}
            color=
            <span class="text-ink">{submittedQuery.data!.colorFamily}</span>{' '}
            <span
              class="inline-block size-3 rounded-full align-middle ml-1"
              style={{
                'background-color':
                  COLOR_PALETTE[submittedQuery.data!.colorFamily].bg,
              }}
            />
          </Show>
        </div>
      </Section>

      <Section title="Fixture set">
        <p class="text-xs text-ink-muted mb-3">
          Click a name to copy it into the input. Each row triggers its own
          pickAvatar query.
        </p>
        <div class="grid grid-cols-2 gap-x-8 gap-y-2">
          <For each={FIXTURE_NAMES}>
            {(name) => (
              <button
                type="button"
                class="text-left rounded px-2 py-1 hover:bg-hover transition-colors"
                onClick={() => {
                  setInput(name);
                  setSubmitted(name);
                }}
              >
                <ResultRow name={name} />
              </button>
            )}
          </For>
        </div>
      </Section>

      <Section title="Registry stats">
        <div class="text-sm text-ink-muted font-mono space-y-1">
          <div>
            icons available:{' '}
            <span class="text-ink">{ICON_NAMES.length}</span>
          </div>
          <div>
            color families:{' '}
            <span class="text-ink">{COLOR_FAMILIES.length}</span> (
            {COLOR_FAMILIES.join(', ')})
          </div>
        </div>
      </Section>
    </div>
  );
}
