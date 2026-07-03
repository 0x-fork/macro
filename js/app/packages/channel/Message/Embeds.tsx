import { EmbedFrame } from '@core/component/LexicalMarkdown/component/decorator/MarkdownEmbed';
import { findEmbedUrls } from '@lexical-core';
import { createMemo, For, Show } from 'solid-js';
import { useMessage } from './context';

const MAX_EMBEDS_PER_MESSAGE = 3;

type EmbedsProps = {
  class?: string;
};

/**
 * Embeds for links in the message body (X posts, YouTube videos, Figma
 * files), rendered below the content — the link itself stays inline.
 */
export function Embeds(props: EmbedsProps) {
  const message = useMessage();
  const embeds = createMemo(() =>
    findEmbedUrls(message().content ?? '', MAX_EMBEDS_PER_MESSAGE)
  );

  return (
    <Show when={embeds().length > 0}>
      <div class={props.class ?? 'flex flex-col gap-2 mt-1 max-w-full'}>
        <For each={embeds()}>
          {(embed) => <EmbedFrame provider={embed.provider} url={embed.url} />}
        </For>
      </div>
    </Show>
  );
}
