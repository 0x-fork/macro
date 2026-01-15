import { useUnfurl } from '@core/signal/unfurl';
import LoadingSpinner from '@icon/regular/spinner.svg';
import {
  $getNodeById,
  $isGithubMentionNode,
  type GithubMentionDecoratorProps,
} from '@lexical-core';
import { createEffect, createMemo, Show, useContext } from 'solid-js';
import { LexicalWrapperContext } from '../../context/LexicalWrapperContext';
import { MentionTooltip } from './MentionTooltip';

function Spinner() {
  return (
    <div class="animate-spin">
      <LoadingSpinner />
    </div>
  );
}

// GitHub Octocat icon
function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" class="w-full h-full">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

export function GithubMention(props: GithubMentionDecoratorProps) {
  const lexicalWrapper = useContext(LexicalWrapperContext);
  const editor = lexicalWrapper?.editor;
  const selection = () => lexicalWrapper?.selection;

  const [unfurlData] = useUnfurl(props.url);

  const isSelectedAsNode = createMemo(() => {
    const sel = selection();
    if (!sel) return false;
    return sel.type === 'node' && sel.nodeKeys.has(props.key);
  });

  // Get the display text - prefer title from props, then unfurl, then fallback to slug
  const displayText = createMemo(() => {
    // First check if we already have a title in props
    if (props.title) {
      return props.title;
    }

    // Try to get title from unfurl
    const data = unfurlData();
    if (data?.type === 'success' && data.data.title) {
      return data.data.title;
    }

    // Fallback to slug format
    if (props.number !== undefined) {
      return `${props.owner}/${props.repo}#${props.number}`;
    }
    return `${props.owner}/${props.repo}`;
  });

  const isLoading = createMemo(() => {
    if (props.title) return false;
    const data = unfurlData();
    return !data || data.type === 'loading';
  });

  // Update the node with the title when unfurl completes
  createEffect(() => {
    const data = unfurlData();
    if (data?.type === 'success' && data.data.title && !props.title) {
      // Update the node with the fetched title
      editor?.update(() => {
        const node = $getNodeById(props.key);
        if ($isGithubMentionNode(node)) {
          node.setTitle(data.data.title);
        }
      });
    }
  });

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(props.url, '_blank', 'noopener,noreferrer');
  };

  const getLinkTypeLabel = () => {
    switch (props.linkType) {
      case 'pull':
        return 'PR';
      case 'issue':
        return 'Issue';
      default:
        return '';
    }
  };

  return (
    <span class="relative">
      <span
        class="py-0.5 cursor-pointer rounded-xs hover:bg-hover focus:bg-active"
        classList={{
          'bg-active text-ink bracket bracket-offset-2': isSelectedAsNode(),
        }}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleClick(e as unknown as MouseEvent);
          }
        }}
        tabIndex={0}
        role="link"
      >
        <span class="pointer-events-auto">
          <span class="relative top-[0.125em] size-[1em] inline-flex mx-1">
            <Show when={!isLoading()} fallback={<Spinner />}>
              <GithubIcon />
            </Show>
          </span>
          <span
            class="underline decoration-current/20 decoration-[max(1px,0.1em)] underline-offset-2"
            data-github-mention="true"
            data-github-url={props.url}
          >
            {displayText()}
            <Show when={getLinkTypeLabel() && props.number !== undefined}>
              <span class="relative text-[0.8em] text-current/50 rounded-xs ml-0.5">
                #{props.number}
              </span>
            </Show>
          </span>
        </span>
      </span>
      <MentionTooltip show={isSelectedAsNode()} text="Open" />
    </span>
  );
}
