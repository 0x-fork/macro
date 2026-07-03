import { HoverCard } from '@core/component/HoverCard';
import { UnfurlLink } from '@core/component/Link';
import { useUnfurl } from '@core/signal/unfurl';
import {
  $isLinkMentionNode,
  getXHandle,
  type LinkMentionDecoratorProps,
  parseEmbedUrl,
} from '@lexical-core';
import FigmaIcon from '@phosphor/figma-logo.svg';
import LinkIcon from '@phosphor/link.svg';
import XLogoIcon from '@phosphor/x-logo.svg';
import YouTubeIcon from '@phosphor/youtube-logo.svg';
import { cn, Surface } from '@ui';
import {
  $getNodeByKey,
  COMMAND_PRIORITY_NORMAL,
  KEY_ENTER_COMMAND,
} from 'lexical';
import { type Component, createEffect, createMemo, useContext } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { LexicalWrapperContext } from '../../context/LexicalWrapperContext';
import { autoRegister } from '../../plugins';
import { MentionTooltip } from './MentionTooltip';

function linkMentionIcon(url: string): Component<{ class?: string }> {
  switch (parseEmbedUrl(url)?.provider) {
    case 'x':
      return XLogoIcon;
    case 'youtube':
      return YouTubeIcon;
    case 'figma':
      return FigmaIcon;
    default:
      return LinkIcon;
  }
}

function fallbackTitle(url: string): string {
  switch (parseEmbedUrl(url)?.provider) {
    case 'x': {
      const handle = getXHandle(url);
      return handle ? `@${handle} on X` : 'Post on X';
    }
    case 'youtube':
      return 'YouTube video';
    case 'figma':
      return 'Figma file';
    default:
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
  }
}

export function LinkMention(props: LinkMentionDecoratorProps) {
  const lexicalWrapper = useContext(LexicalWrapperContext);
  const editor = lexicalWrapper?.editor;
  const selection = () => lexicalWrapper?.selection;

  const [unfurlData] = useUnfurl(
    props.title || lexicalWrapper?.skipPreviewFetch ? undefined : props.url
  );

  const unfurlTitle = () => {
    const data = unfurlData();
    if (data?.type !== 'success') return undefined;
    return data.data.title || undefined;
  };

  const title = createMemo(
    () => props.title || unfurlTitle() || fallbackTitle(props.url)
  );

  const unfurled = createMemo(() => {
    const data = unfurlData();
    if (data?.type === 'success') return data.data;
    return { url: props.url, title: title() };
  });

  // Persist the resolved title so exports and future renders have it.
  createEffect(() => {
    const nextTitle = unfurlTitle();
    if (!editor || !nextTitle) return;

    editor.update(
      () => {
        const node = $getNodeByKey(props.key);
        if ($isLinkMentionNode(node) && !node.getTitle()) {
          node.setTitle(nextTitle);
        }
      },
      { tag: 'historic', discrete: true }
    );
  });

  const isSelectedAsNode = () => {
    const sel = selection();
    if (!sel) return false;
    return sel.type === 'node' && sel.nodeKeys.has(props.key);
  };

  const open = () => {
    window.open(props.url, '_blank');
  };

  if (editor) {
    autoRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        () => {
          if (isSelectedAsNode()) {
            open();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_NORMAL
      )
    );
  }

  return (
    <HoverCard
      trigger={
        <span class="relative">
          <span
            class={cn(
              'size-full py-0.5 cursor-default rounded-xs hover:bg-hover focus:bg-active',
              isSelectedAsNode() && 'bg-active text-ink'
            )}
            data-link-mention="true"
            data-link-mention-url={props.url}
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
          >
            <span class="relative top-[0.125em] size-[1em] inline-flex mx-1">
              <Dynamic
                component={linkMentionIcon(props.url)}
                class="size-full"
              />
            </span>
            <span class="underline decoration-current/20 decoration-[max(1px,0.1em)] underline-offset-2">
              {title()}
            </span>
          </span>
          <MentionTooltip show={isSelectedAsNode()} text="Open" />
        </span>
      }
      content={
        <div class="select-none overflow-hidden w-72 text-ink">
          <Surface depth={3} class="rounded-xl shadow-lg shadow-drop-shadow">
            <UnfurlLink unfurled={unfurled()} />
          </Surface>
        </div>
      }
    />
  );
}
