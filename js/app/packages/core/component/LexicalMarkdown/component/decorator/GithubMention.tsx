import { useUnfurl } from '@core/signal/unfurl';
import type { GithubMentionDecoratorProps } from '@lexical-core';
import { createMemo, useContext } from 'solid-js';
import { LexicalWrapperContext } from '../../context/LexicalWrapperContext';
import { MentionTooltip } from './MentionTooltip';

function GithubIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.71-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.02-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.52 9.52 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.02 1.59 1.02 2.68 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .26.18.57.69.47A10 10 0 0 0 12 2z" />
    </svg>
  );
}

export function GithubMention(props: GithubMentionDecoratorProps) {
  const lexicalWrapper = useContext(LexicalWrapperContext);
  const selection = () => lexicalWrapper?.selection;

  const [unfurlData] = useUnfurl(props.url);

  const displayTitle = createMemo(() => {
    const data = unfurlData();
    if (data?.type === 'success' && data.data.title) {
      return data.data.title;
    }
    return props.title || props.slug || props.url;
  });

  const isSelectedAsNode = () => {
    const sel = selection();
    if (!sel) return false;
    return sel.type === 'node' && sel.nodeKeys.has(props.key);
  };

  return (
    <span class="relative">
      <a
        href={props.url}
        target="_blank"
        rel="noreferrer noopener"
        class="inline-flex items-center gap-1 py-0.5 px-1 cursor-default rounded-xs bg-edge/20 hover:bg-hover focus:bg-active text-ink"
        classList={{
          'bg-active text-ink bracket bracket-offset-2': isSelectedAsNode(),
        }}
        draggable={false}
        data-github-mention="true"
        data-github-url={props.url}
        data-github-slug={props.slug}
        data-github-title={displayTitle()}
      >
        <GithubIcon class="size-3.5" />
        <span class="underline decoration-current/20 decoration-[max(1px,0.1em)] underline-offset-2">
          {displayTitle()}
        </span>
      </a>
      <MentionTooltip show={isSelectedAsNode()} text="Open" />
    </span>
  );
}
