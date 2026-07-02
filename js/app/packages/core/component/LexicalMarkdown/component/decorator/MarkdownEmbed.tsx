import {
  $isEmbedNode,
  type EmbedDecoratorProps,
  type EmbedProvider,
  getTweetId,
  getYouTubeStartSeconds,
  getYouTubeVideoId,
} from '@lexical-core';
import FigmaIcon from '@phosphor/figma-logo.svg';
import LoadingSpinner from '@phosphor/spinner.svg';
import XLogoIcon from '@phosphor/x-logo.svg';
import YouTubeIcon from '@phosphor/youtube-logo.svg';
import { getLiveTheme, isTokensDark } from '@theme/utils/themeUtils';
import { cn } from '@ui';
import { $createNodeSelection, $setSelection } from 'lexical';
import {
  type Component,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  useContext,
} from 'solid-js';
import { match } from 'ts-pattern';
import { LexicalWrapperContext } from '../../context/LexicalWrapperContext';
import { removeNodeAndRestoreSelection } from '../../plugins/shared/removeNodeAndRestoreSelection';
import { MediaButtons } from './MediaButtons';

const IFRAME_SANDBOX =
  'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation';

const PROVIDER_ICONS: Record<EmbedProvider, Component<{ class?: string }>> = {
  x: XLogoIcon,
  youtube: YouTubeIcon,
  figma: FigmaIcon,
};

function EmbedLoading(props: { provider: EmbedProvider }) {
  const Icon = PROVIDER_ICONS[props.provider];
  return (
    <div class="absolute top-0 left-0 size-full flex flex-col justify-center items-center gap-2 text-ink-extra-muted bg-hover/50">
      <Icon class="size-5" />
      <div class="animate-spin size-5">
        <LoadingSpinner class="size-5" />
      </div>
    </div>
  );
}

function TweetFrame(props: { url: string }) {
  let iframeRef!: HTMLIFrameElement;
  let revealTimeout: ReturnType<typeof setTimeout> | undefined;
  const [height, setHeight] = createSignal(0);
  const [loaded, setLoaded] = createSignal(false);

  const dark = createMemo(() => isTokensDark(getLiveTheme().tokens));
  const src = createMemo(() => {
    const id = getTweetId(props.url);
    const theme = dark() ? 'dark' : 'light';
    return `https://platform.twitter.com/embed/Tweet.html?dnt=true&id=${id}&theme=${theme}`;
  });

  // The tweet iframe reports its rendered height via postMessage.
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== 'https://platform.twitter.com') return;
    if (event.source !== iframeRef.contentWindow) return;
    const embed = event.data?.['twttr.embed'];
    if (embed?.method !== 'twttr.private.resize') return;
    const reportedHeight = embed.params?.[0]?.height;
    if (typeof reportedHeight === 'number' && reportedHeight > 0) {
      setHeight(reportedHeight);
      setLoaded(true);
    }
  };

  onMount(() => {
    window.addEventListener('message', onMessage);
  });
  onCleanup(() => {
    window.removeEventListener('message', onMessage);
    clearTimeout(revealTimeout);
  });

  return (
    <div class="relative w-full max-w-[550px]">
      <iframe
        ref={iframeRef}
        title="X post"
        src={src()}
        sandbox={IFRAME_SANDBOX}
        referrerpolicy="strict-origin-when-cross-origin"
        loading="lazy"
        class={cn('w-full border-none', !loaded() && 'invisible')}
        style={{ height: `${height() || 250}px` }}
        onLoad={() => {
          // Unavailable tweets never post a resize — reveal the frame anyway.
          revealTimeout = setTimeout(() => setLoaded(true), 1500);
        }}
      />
      <Show when={!loaded()}>
        <EmbedLoading provider="x" />
      </Show>
    </div>
  );
}

function YouTubeFrame(props: { url: string }) {
  const [loaded, setLoaded] = createSignal(false);

  const src = createMemo(() => {
    const id = getYouTubeVideoId(props.url);
    const start = getYouTubeStartSeconds(props.url);
    return `https://www.youtube-nocookie.com/embed/${id}${
      start ? `?start=${start}` : ''
    }`;
  });

  return (
    <div class="relative w-full max-w-[640px] aspect-video">
      <iframe
        title="YouTube video"
        src={src()}
        sandbox={IFRAME_SANDBOX}
        referrerpolicy="strict-origin-when-cross-origin"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        class={cn('size-full border-none', !loaded() && 'invisible')}
        onLoad={() => setLoaded(true)}
      />
      <Show when={!loaded()}>
        <EmbedLoading provider="youtube" />
      </Show>
    </div>
  );
}

function FigmaFrame(props: { url: string }) {
  const [loaded, setLoaded] = createSignal(false);

  const src = createMemo(
    () =>
      `https://www.figma.com/embed?embed_host=macro&url=${encodeURIComponent(
        props.url
      )}`
  );

  return (
    <div class="relative w-full max-w-[800px] h-112">
      <iframe
        title="Figma file"
        src={src()}
        sandbox={IFRAME_SANDBOX}
        referrerpolicy="strict-origin-when-cross-origin"
        loading="lazy"
        allowfullscreen
        class={cn('size-full border-none', !loaded() && 'invisible')}
        onLoad={() => setLoaded(true)}
      />
      <Show when={!loaded()}>
        <EmbedLoading provider="figma" />
      </Show>
    </div>
  );
}

export function MarkdownEmbed(props: EmbedDecoratorProps) {
  let containerRef!: HTMLDivElement;

  const lexicalWrapper = useContext(LexicalWrapperContext);
  const selection = () => lexicalWrapper?.selection;
  const editor = () => lexicalWrapper?.editor;
  const interactable = () => lexicalWrapper?.isInteractable() ?? false;

  const [hovered, setHovered] = createSignal(false);

  const isSelectedAsNode = () => {
    const sel = selection();
    if (!sel) return false;
    return sel.type === 'node' && sel.nodeKeys.has(props.key);
  };

  const clickHandler = () => {
    const currentEditor = editor();
    if (currentEditor === undefined) return;
    if (!currentEditor.isEditable()) return;
    if (isSelectedAsNode()) return;
    currentEditor.update(() => {
      const sel = $createNodeSelection();
      sel.add(props.key);
      $setSelection(sel);
    });
  };

  const deleteEmbed = () => {
    const currentEditor = editor();
    if (currentEditor === undefined) return;
    removeNodeAndRestoreSelection(currentEditor, props.key, $isEmbedNode);
  };

  return (
    <div
      ref={containerRef}
      class={cn(
        'relative my-4 rounded-md',
        isSelectedAsNode() && 'ring-3 ring-edge-muted'
      )}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        clickHandler();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {match(props.provider)
        .with('x', () => <TweetFrame url={props.url} />)
        .with('youtube', () => <YouTubeFrame url={props.url} />)
        .with('figma', () => <FigmaFrame url={props.url} />)
        .otherwise(() => (
          <a href={props.url} target="_blank" rel="noopener">
            {props.url}
          </a>
        ))}
      <Show when={isSelectedAsNode() || hovered()}>
        <MediaButtons
          delete={interactable() ? deleteEmbed : undefined}
          newTab={() => {
            window.open(props.url, '_blank');
          }}
          containerRef={containerRef}
        />
      </Show>
    </div>
  );
}
