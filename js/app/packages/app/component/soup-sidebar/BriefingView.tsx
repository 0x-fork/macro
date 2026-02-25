import { type Component, For, Show, onMount } from 'solid-js';
import WideStar from '@macro-icons/wide/star.svg';
import WideEmail from '@macro-icons/wide/email.svg';
import WideTask from '@macro-icons/wide/task.svg';
import WideFileMd from '@macro-icons/wide/file-md.svg';
import WideChat from '@macro-icons/wide/chat.svg';
import WideSignal from '@macro-icons/wide/signal.svg';
import IconArrowUp from '@icon/regular/arrow-up.svg';
import IconClock from '@icon/regular/clock.svg';
import IconUsers from '@icon/regular/users.svg';
import { Dynamic } from 'solid-js/web';
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

/**
 * Section types for the briefing view
 */
type BriefingSectionType = 'missed' | 'important' | 'shared' | 'upcoming';

interface BriefingItem {
  id: string;
  title: string;
  subtitle?: string;
  type: 'email' | 'task' | 'document' | 'message' | 'mention';
  timestamp?: string;
  priority?: 'high' | 'medium' | 'low';
  unread?: boolean;
}

interface BriefingSection {
  id: BriefingSectionType;
  title: string;
  icon: Component<{ class?: string }>;
  items: BriefingItem[];
  emptyMessage: string;
}

/**
 * Example data for the briefing view
 */
const EXAMPLE_SECTIONS: BriefingSection[] = [
  {
    id: 'missed',
    title: 'Missed While Away',
    icon: WideSignal,
    emptyMessage: "You're all caught up!",
    items: [
      {
        id: 'missed-1',
        title: 'Re: Q4 Budget Review',
        subtitle: 'Sarah mentioned you in a comment',
        type: 'email',
        timestamp: '2h ago',
        unread: true,
      },
      {
        id: 'missed-2',
        title: '#engineering',
        subtitle: '12 new messages since yesterday',
        type: 'message',
        timestamp: '4h ago',
        unread: true,
      },
      {
        id: 'missed-3',
        title: 'API Integration Task',
        subtitle: 'Status changed to "In Review"',
        type: 'task',
        timestamp: '6h ago',
      },
    ],
  },
  {
    id: 'important',
    title: 'Important Updates',
    icon: IconArrowUp,
    emptyMessage: 'No urgent items right now',
    items: [
      {
        id: 'important-1',
        title: 'Deploy v2.3.0 to Production',
        subtitle: 'Due today - Assigned to you',
        type: 'task',
        timestamp: 'Due today',
        priority: 'high',
      },
      {
        id: 'important-2',
        title: 'Re: Urgent: Client Meeting',
        subtitle: 'From: John Smith (VP Sales)',
        type: 'email',
        timestamp: '1h ago',
        priority: 'high',
        unread: true,
      },
      {
        id: 'important-3',
        title: 'Security Patch Required',
        subtitle: '@you was mentioned in #security',
        type: 'mention',
        timestamp: '30m ago',
        priority: 'high',
        unread: true,
      },
    ],
  },
  {
    id: 'shared',
    title: 'Newly Shared With You',
    icon: IconUsers,
    emptyMessage: 'No new shared items',
    items: [
      {
        id: 'shared-1',
        title: 'Product Roadmap 2024',
        subtitle: 'Shared by Alex Chen',
        type: 'document',
        timestamp: '1h ago',
      },
      {
        id: 'shared-2',
        title: 'Design System Guidelines',
        subtitle: 'Shared by Design Team',
        type: 'document',
        timestamp: '3h ago',
      },
    ],
  },
  {
    id: 'upcoming',
    title: 'Coming Up',
    icon: IconClock,
    emptyMessage: 'Nothing scheduled',
    items: [
      {
        id: 'upcoming-1',
        title: 'Weekly Standup',
        subtitle: 'In 30 minutes - #engineering',
        type: 'message',
        timestamp: '10:00 AM',
      },
      {
        id: 'upcoming-2',
        title: 'Code Review: PR #1234',
        subtitle: 'Due by end of day',
        type: 'task',
        timestamp: 'Today',
      },
    ],
  },
];

/**
 * Get icon for briefing item type
 */
function getItemIcon(type: BriefingItem['type']) {
  switch (type) {
    case 'email':
      return WideEmail;
    case 'task':
      return WideTask;
    case 'document':
      return WideFileMd;
    case 'message':
    case 'mention':
      return WideChat;
    default:
      return WideStar;
  }
}

/**
 * Get priority color class
 */
function getPriorityClass(priority?: BriefingItem['priority']): string {
  switch (priority) {
    case 'high':
      return 'text-red-500';
    case 'medium':
      return 'text-yellow-500';
    case 'low':
      return 'text-ink-muted';
    default:
      return 'text-ink-muted';
  }
}

interface BriefingItemRowProps {
  item: BriefingItem;
  onClick?: () => void;
}

const BriefingItemRow: Component<BriefingItemRowProps> = (props) => {
  const Icon = getItemIcon(props.item.type);

  return (
    <button
      type="button"
      class="w-full flex items-start gap-3 px-3 py-2.5 text-left rounded-lg transition-colors hover:bg-ink/5 group"
      onClick={props.onClick}
    >
      {/* Icon */}
      <div class="mt-0.5 shrink-0">
        <Dynamic
          component={Icon}
          class={`size-4 ${props.item.unread ? 'text-accent' : 'text-ink-muted'}`}
        />
      </div>

      {/* Content */}
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span
            class={`text-sm truncate ${props.item.unread ? 'font-medium text-ink' : 'text-ink'}`}
          >
            {props.item.title}
          </span>
          <Show when={props.item.unread}>
            <span class="size-1.5 rounded-full bg-accent shrink-0" />
          </Show>
        </div>
        <Show when={props.item.subtitle}>
          <p class="text-xs text-ink-muted truncate mt-0.5">
            {props.item.subtitle}
          </p>
        </Show>
      </div>

      {/* Timestamp / Priority */}
      <div class="shrink-0 text-right">
        <span
          class={`text-xs ${props.item.priority ? getPriorityClass(props.item.priority) : 'text-ink-extra-muted'}`}
        >
          {props.item.timestamp}
        </span>
      </div>
    </button>
  );
};

interface BriefingSectionCardProps {
  section: BriefingSection;
}

const BriefingSectionCard: Component<BriefingSectionCardProps> = (props) => {
  return (
    <div class="bg-panel rounded-xl border border-edge-muted overflow-hidden">
      {/* Section header */}
      <div class="flex items-center gap-2 px-4 py-3 border-b border-edge-muted bg-panel-muted/50">
        <Dynamic component={props.section.icon} class="size-4 text-ink-muted" />
        <h3 class="text-sm font-medium text-ink">{props.section.title}</h3>
        <Show when={props.section.items.length > 0}>
          <span class="ml-auto text-xs text-ink-extra-muted">
            {props.section.items.length} item
            {props.section.items.length !== 1 ? 's' : ''}
          </span>
        </Show>
      </div>

      {/* Items */}
      <Show
        when={props.section.items.length > 0}
        fallback={
          <div class="px-4 py-6 text-center text-sm text-ink-muted">
            {props.section.emptyMessage}
          </div>
        }
      >
        <div class="divide-y divide-edge-muted">
          <For each={props.section.items}>
            {(item) => (
              <BriefingItemRow
                item={item}
                onClick={() => {
                  // TODO: Navigate to the item
                  console.log('Navigate to:', item.id);
                }}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

/**
 * AI Chat input for the briefing view
 */
const BriefingChatInput: Component = () => {
  let containerRef!: HTMLDivElement;
  const splitPanelContext = useSplitPanelOrThrow();
  const ctx = useChatContext();

  const chatMarkdownArea = useChatMarkdownArea({
    addAttachment: (a) => ctx.attachments.addAttachment(a),
  });

  const [attachHotkeys] = useHotkeyDOMScope('briefing.chatInput');

  onMount(() => {
    attachHotkeys(containerRef);
  });

  const handleSend = async (request: Send | CreateAndSend) => {
    if (request.type !== 'createAndSend') return;

    // Create a new persistent chat
    const response = await cognitionApiServiceClient.createChat({
      isPersistent: true,
    });
    if (isErr(response)) {
      console.error('Failed to create chat', response);
      return;
    }
    const [, { id: chatId }] = response;

    // Store the pending send data for the chat to pick up
    setPendingSendData({
      content: request.content,
      attachments: request.attachments,
      model: request.model,
    });

    // Replace the briefing split with the chat split
    splitPanelContext.handle.replace({
      next: { type: 'chat', id: chatId },
    });
  };

  return (
    <div
      ref={containerRef}
      class="shrink-0 border-t border-edge-muted bg-panel px-4 py-3"
    >
      <div class="max-w-2xl mx-auto">
        <ChatInput
          markdown={chatMarkdownArea}
          onSend={handleSend}
          isPersistent={true}
          autoFocusOnMount={false}
        />
      </div>
    </div>
  );
};

export interface BriefingViewProps {
  /** Callback to exit briefing and show regular list */
  onClose?: () => void;
}

/**
 * Inner component that has access to chat context
 */
const BriefingViewInner: Component<BriefingViewProps> = (props) => {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Calculate totals for the summary
  const totalUnread = EXAMPLE_SECTIONS.reduce(
    (sum, section) => sum + section.items.filter((i) => i.unread).length,
    0
  );
  const totalHighPriority = EXAMPLE_SECTIONS.reduce(
    (sum, section) =>
      sum + section.items.filter((i) => i.priority === 'high').length,
    0
  );

  return (
    <div class="size-full flex flex-col bg-page">
      {/* Header */}
      <div class="shrink-0 px-6 py-5 border-b border-edge-muted">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold text-ink flex items-center gap-2">
              <WideStar class="size-5 text-accent" />
              Your Briefing
            </h1>
            <p class="text-sm text-ink-muted mt-1">{today}</p>
          </div>
          <Show when={props.onClose}>
            <button
              type="button"
              class="text-xs text-ink-muted hover:text-ink px-3 py-1.5 rounded-md hover:bg-ink/10 transition-colors"
              onClick={props.onClose}
            >
              View all items
            </button>
          </Show>
        </div>

        {/* Quick stats */}
        <div class="flex items-center gap-4 mt-4">
          <div class="flex items-center gap-1.5 text-sm">
            <span class="size-2 rounded-full bg-accent" />
            <span class="text-ink-muted">
              <span class="font-medium text-ink">{totalUnread}</span> unread
            </span>
          </div>
          <div class="flex items-center gap-1.5 text-sm">
            <span class="size-2 rounded-full bg-red-500" />
            <span class="text-ink-muted">
              <span class="font-medium text-ink">{totalHighPriority}</span> high
              priority
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div class="flex-1 overflow-y-auto p-6">
        <div class="max-w-2xl mx-auto space-y-4">
          <For each={EXAMPLE_SECTIONS}>
            {(section) => <BriefingSectionCard section={section} />}
          </For>
        </div>
      </div>

      {/* AI Chat input at the bottom */}
      <BriefingChatInput />
    </div>
  );
};

/**
 * Briefing view that shows a summary of:
 * - Missed content while away
 * - Important/urgent items
 * - Newly shared items
 * - Upcoming deadlines
 * - AI chat for asking questions about the briefing
 *
 * This component is registered as a routable component at /app/component/briefing
 */
export const BriefingView: Component<BriefingViewProps> = (props) => {
  return (
    <ChatContextProvider autoAttach={false}>
      <BriefingViewInner {...props} />
    </ChatContextProvider>
  );
};

export default BriefingView;
