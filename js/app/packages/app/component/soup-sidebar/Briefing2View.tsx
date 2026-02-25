import { type Component, For, Show, onMount, createSignal } from 'solid-js';
import WideStar from '@macro-icons/wide/star.svg';
import MacroLogo from '@macro-icons/macro-logo.svg';
import {
  ChatContextProvider,
  useChatContext,
} from '@core/component/AI/context';
import { ChatInput } from '@core/component/AI/component/input/useChatInput';
import { useChatMarkdownArea } from '@core/component/AI/component/input/useChatMarkdownArea';
import { setPendingSendData } from '@core/component/AI/signal/pendingSend';
import type { CreateAndSend, Send } from '@core/component/AI/types';
import { isErr } from '@core/util/maybeResult';
import { cognitionApiServiceClient } from '@service-cognition/client';
import { useHotkeyDOMScope } from 'core/hotkey/hotkeys';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { MarkdownTextarea } from '@core/component/LexicalMarkdown/component/core/MarkdownTextarea';

/**
 * Inline briefing item - displayed as part of the text flow
 */
interface BriefingInlineItem {
  id: string;
  text: string;
  type: 'email' | 'task' | 'doc' | 'message' | 'meeting';
  href?: string;
}

/**
 * Briefing line with optional inline items
 */
interface BriefingLine {
  prefix: string;
  items?: BriefingInlineItem[];
  suffix?: string;
}

/**
 * Example briefing content - short, inline format
 */
const BRIEFING_LINES: BriefingLine[] = [
  {
    prefix: 'You have ',
    items: [{ id: '1', text: '3 unread emails', type: 'email' }],
    suffix: ' requiring attention.',
  },
  {
    prefix: '',
    items: [{ id: '2', text: 'Sarah mentioned you', type: 'message' }],
    suffix: ' in #engineering about the API changes.',
  },
  {
    prefix: 'Due today: ',
    items: [{ id: '3', text: 'Deploy v2.3.0', type: 'task' }],
    suffix: ' and review PR #1234.',
  },
  {
    prefix: '',
    items: [{ id: '4', text: 'Product Roadmap', type: 'doc' }],
    suffix: ' was shared with you by Alex.',
  },
  {
    prefix: 'Next meeting: ',
    items: [{ id: '5', text: 'Weekly Standup', type: 'meeting' }],
    suffix: ' in 45 minutes.',
  },
  {
    prefix: '2 tasks were ',
    items: [{ id: '6', text: 'marked complete', type: 'task' }],
    suffix: ' by your team.',
  },
];

/**
 * Inspirational quotes for the placeholder
 */
const QUOTES = [
  'The best way to predict the future is to create it.',
  'Simplicity is the ultimate sophistication.',
  'Focus on being productive instead of busy.',
  'Small steps lead to big changes.',
  'Your only limit is your mind.',
];

/**
 * Get a random quote
 */
function getRandomQuote(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

/**
 * Get color class for item type
 */
function getItemColorClass(type: BriefingInlineItem['type']): string {
  switch (type) {
    case 'email':
      return 'text-blue-500 hover:text-blue-600';
    case 'task':
      return 'text-green-500 hover:text-green-600';
    case 'doc':
      return 'text-purple-500 hover:text-purple-600';
    case 'message':
      return 'text-orange-500 hover:text-orange-600';
    case 'meeting':
      return 'text-pink-500 hover:text-pink-600';
    default:
      return 'text-accent hover:text-accent/80';
  }
}

/**
 * Inline link component for briefing items
 */
const InlineItem: Component<{ item: BriefingInlineItem }> = (props) => {
  return (
    <button
      type="button"
      class={`font-medium underline underline-offset-2 decoration-current/40 hover:decoration-current transition-colors ${getItemColorClass(props.item.type)}`}
      onClick={() => {
        console.log('Navigate to:', props.item.id, props.item.type);
      }}
    >
      {props.item.text}
    </button>
  );
};

/**
 * Briefing line component
 */
const BriefingLineComponent: Component<{ line: BriefingLine }> = (props) => {
  return (
    <p class="text-sm text-ink leading-relaxed">
      {props.line.prefix}
      <For each={props.line.items}>
        {(item, index) => (
          <>
            <InlineItem item={item} />
            <Show when={index() < (props.line.items?.length ?? 0) - 1}>, </Show>
          </>
        )}
      </For>
      {props.line.suffix}
    </p>
  );
};

/**
 * Compact briefing section
 */
const CompactBriefing: Component = () => {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div class="space-y-3">
      {/* Header */}
      <div class="flex items-center gap-2">
        <WideStar class="size-4 text-accent" />
        <h2 class="text-sm font-semibold text-ink">Your Briefing</h2>
        <span class="text-xs text-ink-muted">- {today}</span>
      </div>

      {/* Briefing lines */}
      <div class="space-y-2 pl-6">
        <For each={BRIEFING_LINES}>
          {(line) => <BriefingLineComponent line={line} />}
        </For>
      </div>
    </div>
  );
};

/**
 * Placeholder content with Macro logo and quote
 */
const ChatPlaceholder: Component = () => {
  const quote = getRandomQuote();

  return (
    <div class="flex flex-col items-center text-center px-8">
      <MacroLogo class="size-24 text-ink-extra-muted/30 mb-6" />
      <p class="text-base text-ink-muted/70 italic max-w-sm leading-relaxed">
        "{quote}"
      </p>
    </div>
  );
};

/**
 * AI Chat input component
 */
const BriefingChatInput: Component = () => {
  let containerRef!: HTMLDivElement;
  const splitPanelContext = useSplitPanelOrThrow();
  const ctx = useChatContext();

  const chatMarkdownArea = useChatMarkdownArea({
    addAttachment: (a) => ctx.attachments.addAttachment(a),
  });

  const [attachHotkeys] = useHotkeyDOMScope('briefing2.chatInput');

  onMount(() => {
    attachHotkeys(containerRef);
  });

  const handleSend = async (request: Send | CreateAndSend) => {
    if (request.type !== 'createAndSend') return;

    const response = await cognitionApiServiceClient.createChat({
      isPersistent: true,
    });
    if (isErr(response)) {
      console.error('Failed to create chat', response);
      return;
    }
    const [, { id: chatId }] = response;

    setPendingSendData({
      content: request.content,
      attachments: request.attachments,
      model: request.model,
    });

    splitPanelContext.handle.replace({
      next: { type: 'chat', id: chatId },
    });
  };

  return (
    <div ref={containerRef}>
      <ChatInput
        markdown={chatMarkdownArea}
        onSend={handleSend}
        isPersistent={true}
        autoFocusOnMount={false}
      />
    </div>
  );
};

/**
 * Scratch pad section with markdown editor
 */
const ScratchPad: Component = () => {
  const [_content, setContent] = createSignal('');

  return (
    <div class="h-full flex flex-col bg-panel overflow-y-auto">
      <div class="h-full p-4">
        <MarkdownTextarea
          editable={() => true}
          onChange={(value) => setContent(value)}
          placeholder="Write anything here... notes, ideas, drafts..."
          type="markdown"
          class="min-h-full"
        />
      </div>
    </div>
  );
};

/**
 * Inner component with chat context
 */
const Briefing2ViewInner: Component = () => {
  return (
    <div class="size-full flex bg-page">
      {/* Left column: Briefing + Placeholder + AI Chat at bottom */}
      <div class="flex-1 flex flex-col border-r border-edge-muted">
        {/* Briefing section */}
        <div class="shrink-0 p-6 pb-6 border-b border-edge-muted">
          <CompactBriefing />
        </div>

        {/* Placeholder content - fills available space */}
        <div class="flex-1 flex items-center justify-center min-h-0">
          <ChatPlaceholder />
        </div>

        {/* AI Chat input pinned to bottom */}
        <div class="shrink-0 p-6 pt-4">
          <BriefingChatInput />
        </div>
      </div>

      {/* Right column: Scratch Pad (narrower, no padding) */}
      <div class="w-72 shrink-0">
        <ScratchPad />
      </div>
    </div>
  );
};

/**
 * Briefing 2 View - Two column layout with:
 * - Left: Compact briefing + AI chat with placeholder
 * - Right: Narrow scratch pad for notes
 *
 * Accessible at /app/component/briefing2
 */
export const Briefing2View: Component = () => {
  return (
    <ChatContextProvider autoAttach={false}>
      <Briefing2ViewInner />
    </ChatContextProvider>
  );
};

export default Briefing2View;
