import {
  PREDEFINED_VIEWS,
  getViewsForGroup,
  type PredefinedView,
} from './predefined-views';
import { useIsGoToScopeActive, useIsPinnedScopeActive, updatePinnedItemsForHotkeys } from './sidebar-hotkeys';
import { LabelAndHotKey, Tooltip } from '@core/component/Tooltip';
import PlusIcon from '@macro-icons/wide/plus.svg';
import MacroLogo from '@macro-icons/macro-logo.svg';
import WideChat from '@macro-icons/wide/chat.svg';
import WideEmail from '@macro-icons/wide/email.svg';
import WideFileMd from '@macro-icons/wide/file-md.svg';
import WideStar from '@macro-icons/wide/star.svg';
import SearchIcon from '@macro-icons/macro-magnifying-glass.svg';
import CommandIcon from '@phosphor-icons/core/assets/regular/command.svg';
import XIcon from '@icon/regular/x.svg';
import PushPinIcon from '@phosphor-icons/core/assets/regular/push-pin.svg';
import CaretRightIcon from '@phosphor-icons/core/assets/regular/caret-right.svg';
import GearIcon from '@phosphor-icons/core/assets/regular/gear.svg';
import PhosphorPlusIcon from '@phosphor-icons/core/assets/regular/plus.svg';
import { useSettingsState } from '@core/constant/SettingsState';
import { type Component, For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { globalSplitManager } from '@app/signal/splitLayout';
import { Dynamic } from 'solid-js/web';
import { setCreateMenuOpen } from '@app/component/Launcher';
import { setPendingView, setPendingPinnedItem, setApplyViewToSplit, setApplyContextualFilters, type PinnedItem, getSplitIndicesForView, activeViewsBySplit } from './sidebar-selection-state';
import type { SplitId } from '@app/component/split-layout/layoutManager';

/**
 * Example pinned items for demonstration.
 * In a real implementation, these would come from user preferences/storage.
 */
const EXAMPLE_PINNED_ITEMS: PinnedItem[] = [
  {
    id: 'pinned-1',
    label: '#general',
    type: 'channel',
    entityId: 'example-channel-id-1',
    notification: 'high', // Direct mention - filled dot
  },
  {
    id: 'pinned-2', 
    label: '#engineering',
    type: 'channel',
    entityId: 'example-channel-id-2',
    notification: 'low', // Unread but less important - ring with dot
  },
  {
    id: 'pinned-3',
    label: 'Project Roadmap',
    type: 'md',
    entityId: 'example-doc-id-1',
  },
  {
    id: 'pinned-4',
    label: 'Re: Q4 Planning',
    type: 'email',
    entityId: 'example-email-id-1',
    notification: 'high', // Important email
  },
];

/**
 * Open conversation item type
 */
interface OpenConversation {
  id: string;
  label: string;
  type: 'channel' | 'dm';
  entityId: string;
  /** Avatar initials for DMs */
  initials?: string;
  /** Whether the conversation has unread messages */
  hasUnread?: boolean;
}

/**
 * Example open conversations
 */
const INITIAL_OPEN_CONVERSATIONS: OpenConversation[] = [
  { id: 'conv-1', label: 'Sarah Chen', type: 'dm', entityId: 'dm-1', initials: 'SC', hasUnread: true },
  { id: 'conv-2', label: '#design-reviews', type: 'channel', entityId: 'channel-1' },
  { id: 'conv-3', label: 'Mike Johnson', type: 'dm', entityId: 'dm-2', initials: 'MJ' },
  { id: 'conv-4', label: '#product-updates', type: 'channel', entityId: 'channel-2', hasUnread: true },
  { id: 'conv-5', label: 'Alex Kim', type: 'dm', entityId: 'dm-3', initials: 'AK' },
];

export interface SoupSidebarProps {
  /** Callback when a view with contextual filters is selected */
  onViewSelect?: (view: PredefinedView) => void;
}

/**
 * Get icon component for a pinned item based on its type
 */
function getIconForPinnedItem(item: PinnedItem) {
  switch (item.type) {
    case 'channel':
      return WideChat;
    case 'email':
      return WideEmail;
    case 'md':
    case 'write':
      return WideFileMd;
    default:
      return WideStar;
  }
}

/**
 * Format index for display: 1-9, 0 for 10th, then a-z for 11+
 */
function formatIndexKey(index: number): string {
  if (index < 9) return String(index + 1); // 1-9
  if (index === 9) return '0'; // 10th item
  if (index < 36) return String.fromCharCode(97 + index - 10); // a-z (indices 10-35)
  return ''; // No hotkey beyond 36 items
}

/**
 * Sidebar for the soup view, inspired by Linear's UI.
 * Shows predefined views with filters and a create button.
 *
 * Always visible, full height, on the left side.
 * Clicking a view shows overlays on all splits to choose where to open it.
 */
export const SoupSidebar: Component<SoupSidebarProps> = (props) => {
  const isGoToActive = useIsGoToScopeActive();
  const isPinnedActive = useIsPinnedScopeActive();
  
  // Register pinned items for hotkeys on mount
  onMount(() => {
    updatePinnedItemsForHotkeys(EXAMPLE_PINNED_ITEMS);
  });
  
  // Views that should navigate to their own component instead of applying filters
  const STANDALONE_VIEWS = ['briefing', 'briefing2'] as const;

  const handleViewClick = (view: PredefinedView) => {
    const manager = globalSplitManager();
    const activeSplitId = manager?.activeSplitId();
    
    if (!activeSplitId || !manager) {
      // Fallback: show overlays to let user pick a split
      setPendingView(view);
      return;
    }

    const split = manager.getSplit(activeSplitId);
    if (!split) {
      setPendingView(view);
      return;
    }

    // Check if this view should navigate to its own component (like briefing)
    if (STANDALONE_VIEWS.includes(view.id as typeof STANDALONE_VIEWS[number])) {
      split.replace({
        next: {
          type: 'component',
          id: view.id,
        },
        referredFrom: 'launcher',
      });
      return;
    }

    // Check if the split already has a list component
    const content = split.content();
    const isListComponent = content.type === 'component' && 
      content.id === 'unified-list';

    if (isListComponent) {
      // Signal to the existing soup to apply the new filters
      setApplyViewToSplit({ splitId: activeSplitId, view });
    } else {
      // Replace with unified-list component and apply view filters
      split.replace({
        next: {
          type: 'component',
          id: 'unified-list',
        },
        referredFrom: 'launcher',
      });
      
      // Signal to apply filters after component mounts
      setTimeout(() => {
        setApplyViewToSplit({ splitId: activeSplitId, view });
      }, 100);
    }
      
    // If the view has contextual filters, apply them too
    if (view.contextualFilters && view.contextualFilters.length > 0) {
      setApplyContextualFilters({
        splitId: activeSplitId,
        contextualFilterIds: view.contextualFilters,
      });
    }

    // Notify parent about the view selection (for contextual filters)
    props.onViewSelect?.(view);
  };

  const handlePinnedItemClick = (item: PinnedItem) => {
    // Set the pending pinned item to show overlays on splits
    setPendingPinnedItem(item);
  };

  const handleCreateClick = () => {
    setCreateMenuOpen(true);
  };

  const handleSearchClick = () => {
    // TODO: Open search/launcher
    console.log('Open search');
  };

  const handleCommandPaletteClick = () => {
    // TODO: Open command palette
    console.log('Open command palette');
  };

  return (
    <div class="w-56 h-full flex-shrink-0 bg-panel border-r border-edge-muted flex flex-col">
      {/* Header with logo and action buttons */}
      <div class="px-3 py-2 shrink-0 flex items-center justify-between">
        <MacroLogo class="size-5 text-accent" />
        <div class="flex items-center gap-1">
          <Tooltip tooltip={<LabelAndHotKey label="Search" shortcut="/" />}>
            <button
              type="button"
              class="flex items-center justify-center size-6 bg-ink/10 text-ink-muted hover:bg-ink/20 hover:text-ink rounded transition-colors"
              onClick={handleSearchClick}
            >
              <SearchIcon class="size-3.5" />
            </button>
          </Tooltip>
          <Tooltip tooltip={<LabelAndHotKey label="Command palette" shortcut="⌘K" />}>
            <button
              type="button"
              class="flex items-center justify-center size-6 bg-ink/10 text-ink-muted hover:bg-ink/20 hover:text-ink rounded transition-colors"
              onClick={handleCommandPaletteClick}
            >
              <CommandIcon class="size-3.5" />
            </button>
          </Tooltip>
          <Tooltip tooltip={<LabelAndHotKey label="Create new" shortcut="c" />}>
            <button
              type="button"
              class="flex items-center justify-center size-6 bg-ink/10 text-ink-muted hover:bg-ink/20 hover:text-ink rounded transition-colors"
              onClick={handleCreateClick}
            >
              <PlusIcon class="size-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Scrollable content */}
      <div class="flex-1 overflow-y-auto py-2 px-2">
        {/* Top level items (Briefing, Briefing 2, Inbox) */}
        <div class="mb-8">
          <For each={getViewsForGroup('top')}>
            {(view) => (
              <SidebarViewItem
                view={view}
                index={PREDEFINED_VIEWS.indexOf(view)}
                onClick={() => handleViewClick(view)}
                showShortcutHint={isGoToActive() && !isPinnedActive()}
              />
            )}
          </For>
        </div>

        {/* Open conversations section */}
        <ConversationsSection />

        {/* Pinned items section */}
        <PinnedItemsSection 
          isGoToActive={isGoToActive()}
          isPinnedActive={isPinnedActive()}
          onItemClick={handlePinnedItemClick}
        />

        {/* Views section - empty state */}
        <div class="mb-4">
          <div class="group/views flex items-center justify-between px-2 py-1.5">
            <span class="text-xs font-medium text-ink/50">Views</span>
            <Tooltip tooltip="Create view">
              <button
                type="button"
                class="size-5 flex items-center justify-center rounded text-ink/40 hover:text-ink hover:bg-ink/10 transition-colors opacity-0 group-hover/views:opacity-100"
                onClick={() => console.log('Create view')}
              >
                <PhosphorPlusIcon class="size-3.5" />
              </button>
            </Tooltip>
          </div>
          <div class="px-2 py-3 text-xs text-ink-muted text-center">
            No saved views yet
          </div>
        </div>
      </div>

      {/* Account selector at bottom */}
      <AccountSelector />
    </div>
  );
};

/**
 * Pinned items section component
 */
interface PinnedItemsSectionProps {
  isGoToActive: boolean;
  isPinnedActive: boolean;
  onItemClick: (item: PinnedItem) => void;
}

const PinnedItemsSection: Component<PinnedItemsSectionProps> = (props) => {
  const [pinnedItems, setPinnedItems] = createSignal(EXAMPLE_PINNED_ITEMS);
  const [isCollapsed, setIsCollapsed] = createSignal(false);

  const handleUnpin = (id: string) => {
    setPinnedItems(prev => prev.filter(item => item.id !== id));
  };

  return (
    <Show when={pinnedItems().length > 0}>
      <div class="mb-3">
        <div 
          class="group/pinned flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-ink/10 transition-colors cursor-pointer"
          onClick={() => setIsCollapsed(!isCollapsed())}
        >
          <div class="flex items-center gap-1">
            <CaretRightIcon 
              class="size-3 text-ink/40 transition-transform" 
              classList={{ 'rotate-90': !isCollapsed() }}
            />
            <span class="text-xs font-medium text-ink/50">Pinned</span>
            {/* Show "p" hint when g is active but not yet in pinned scope */}
            <Show when={props.isGoToActive && !props.isPinnedActive}>
              <ShortcutHint key="p" />
            </Show>
          </div>
          <Tooltip tooltip="Pin item">
            <button
              type="button"
              class="size-5 flex items-center justify-center rounded text-ink/40 hover:text-ink hover:bg-ink/20 transition-colors opacity-0 group-hover/pinned:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                console.log('Pin item');
              }}
            >
              <PhosphorPlusIcon class="size-3.5" />
            </button>
          </Tooltip>
        </div>
        <Show when={!isCollapsed()}>
          <div class="flex flex-col gap-0.5">
            <For each={pinnedItems()}>
              {(item, index) => (
                <SidebarPinnedItem
                  item={item}
                  index={index()}
                  onClick={() => props.onItemClick(item)}
                  onUnpin={() => handleUnpin(item.id)}
                  showShortcutHint={props.isPinnedActive}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
};

/**
 * Conversations section component (renamed from Open)
 */
const ConversationsSection: Component = () => {
  const [conversations, setConversations] = createSignal(INITIAL_OPEN_CONVERSATIONS);
  const [isCollapsed, setIsCollapsed] = createSignal(false);

  const handleRemove = (id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
  };

  const handleClick = (conv: OpenConversation) => {
    // TODO: Navigate to conversation
    console.log('Open conversation:', conv.id);
  };

  return (
    <Show when={conversations().length > 0}>
      <div class="mb-3">
        <div 
          class="group/conversations flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-ink/10 transition-colors cursor-pointer"
          onClick={() => setIsCollapsed(!isCollapsed())}
        >
          <div class="flex items-center gap-1">
            <CaretRightIcon 
              class="size-3 text-ink/40 transition-transform" 
              classList={{ 'rotate-90': !isCollapsed() }}
            />
            <span class="text-xs font-medium text-ink/50">Conversations</span>
          </div>
          <Tooltip tooltip="New conversation">
            <button
              type="button"
              class="size-5 flex items-center justify-center rounded text-ink/40 hover:text-ink hover:bg-ink/20 transition-colors opacity-0 group-hover/conversations:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                console.log('New conversation');
              }}
            >
              <PhosphorPlusIcon class="size-3.5" />
            </button>
          </Tooltip>
        </div>
        <Show when={!isCollapsed()}>
          <div class="flex flex-col gap-0.5">
            <For each={conversations()}>
              {(conv) => (
                <OpenConversationItem
                  conversation={conv}
                  onClick={() => handleClick(conv)}
                  onRemove={() => handleRemove(conv.id)}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
};

interface OpenConversationItemProps {
  conversation: OpenConversation;
  onClick: () => void;
  onRemove: () => void;
}

const OpenConversationItem: Component<OpenConversationItemProps> = (props) => {
  return (
    <div class="group relative">
      <button
        type="button"
        class="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors text-ink-muted hover:bg-ink/10 hover:text-ink text-left"
        onClick={props.onClick}
      >
        {/* Icon or avatar */}
        <span class="relative flex-shrink-0">
          <Show
            when={props.conversation.type === 'dm'}
            fallback={<WideChat class="size-4" />}
          >
            <div class="size-5 rounded-full bg-ink/20 flex items-center justify-center text-[9px] font-medium text-ink">
              {props.conversation.initials}
            </div>
          </Show>
          {/* Unread indicator */}
          <Show when={props.conversation.hasUnread}>
            <span class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent" />
          </Show>
        </span>
        <span class="truncate flex-1">{props.conversation.label}</span>
      </button>
      {/* Remove button - shows on hover */}
      <button
        type="button"
        class="absolute right-1 top-1/2 -translate-y-1/2 size-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-ink/20 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          props.onRemove();
        }}
      >
        <XIcon class="size-3 text-ink-muted" />
      </button>
    </div>
  );
};

/**
 * Example accounts for the account selector
 */
const EXAMPLE_ACCOUNTS = [
  { id: '1', name: 'John Doe', email: 'john@example.com', initials: 'JD', color: 'bg-accent/20 text-accent' },
  { id: '2', name: 'Jane Smith', email: 'jane@company.co', initials: 'JS', color: 'bg-purple-500/20 text-purple-500' },
  { id: '3', name: 'Work Account', email: 'john@work.com', initials: 'WA', color: 'bg-green-500/20 text-green-500' },
];

/**
 * Account selector dropdown component
 */
const AccountSelector: Component = () => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [selectedAccount, setSelectedAccount] = createSignal(EXAMPLE_ACCOUNTS[0]);
  const { toggleSettings } = useSettingsState();

  const handleAccountSelect = (account: typeof EXAMPLE_ACCOUNTS[0]) => {
    setSelectedAccount(account);
    setIsOpen(false);
  };

  return (
    <div class="shrink-0 border-t border-edge-muted p-2 relative flex items-center gap-1">
      {/* Current account button */}
      <button
        type="button"
        class="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-ink/10 transition-colors"
        onClick={() => setIsOpen(!isOpen())}
      >
        <div class={`size-6 shrink-0 rounded-full flex items-center justify-center text-xs font-medium ${selectedAccount().color}`}>
          {selectedAccount().initials}
        </div>
        <div class="flex-1 min-w-0 text-left">
          <div class="text-xs font-medium text-ink truncate">{selectedAccount().name}</div>
          <div class="text-[10px] text-ink-muted truncate">{selectedAccount().email}</div>
        </div>
        <svg 
          class="size-3 shrink-0 text-ink-muted transition-transform" 
          classList={{ 'rotate-180': isOpen() }}
          viewBox="0 0 12 12" 
          fill="none"
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      {/* Settings button */}
      <Tooltip tooltip={<LabelAndHotKey label="Settings" shortcut="," />}>
        <button
          type="button"
          class="flex items-center justify-center size-6 rounded-md text-ink-muted hover:text-ink hover:bg-ink/10 transition-colors shrink-0"
          onClick={() => toggleSettings()}
        >
          <GearIcon class="size-3.5" />
        </button>
      </Tooltip>

      {/* Dropdown */}
      <Show when={isOpen()}>
        <div class="absolute bottom-full left-2 right-2 mb-1 bg-panel border border-edge-muted rounded-lg shadow-lg overflow-hidden">
          <For each={EXAMPLE_ACCOUNTS}>
            {(account) => (
              <button
                type="button"
                class="w-full flex items-center gap-2 px-2 py-2 hover:bg-ink/10 transition-colors"
                classList={{ 'bg-ink/5': account.id === selectedAccount().id }}
                onClick={() => handleAccountSelect(account)}
              >
                <div class={`size-6 rounded-full flex items-center justify-center text-xs font-medium ${account.color}`}>
                  {account.initials}
                </div>
                <div class="flex-1 min-w-0 text-left">
                  <div class="text-xs font-medium text-ink truncate">{account.name}</div>
                  <div class="text-[10px] text-ink-muted truncate">{account.email}</div>
                </div>
                <Show when={account.id === selectedAccount().id}>
                  <svg class="size-3.5 text-accent" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7.5L5.5 10.5L11.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

/**
 * Notification indicator for pinned items
 * - 'high': Filled dot (direct mention/important)
 * - 'low': Ring with small dot inside (unread but less important)
 * 
 * Positioned absolutely to float on top-right of parent
 */
const NotificationIndicator: Component<{ priority: 'high' | 'low' }> = (props) => {
  return (
    <Show
      when={props.priority === 'high'}
      fallback={
        // Low priority: ring with small dot inside
        <span class="absolute -top-0.5 -right-0.5 size-2">
          <span class="absolute inset-0 rounded-full border border-accent bg-panel" />
          <span class="absolute inset-[2px] rounded-full bg-accent" />
        </span>
      }
    >
      {/* High priority: filled dot */}
      <span class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent" />
    </Show>
  );
};

interface SidebarPinnedItemProps {
  item: PinnedItem;
  index: number;
  onClick: () => void;
  onUnpin: () => void;
  showShortcutHint?: boolean;
}

const SidebarPinnedItem: Component<SidebarPinnedItemProps> = (props) => {
  const Icon = getIconForPinnedItem(props.item);
  
  const splitIndices = createMemo(() => 
    getSplitIndicesForEntity(props.item.type, props.item.entityId)
  );

  const shortcutKey = () => formatIndexKey(props.index);
  
  return (
    <Tooltip
      tooltip={<LabelAndHotKey label={props.item.label} shortcut={`v p ${shortcutKey()}`} />}
      placement="right"
    >
      <div class="group relative">
        <button
          type="button"
          class="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors text-ink-muted hover:bg-ink/10 hover:text-ink text-left"
          onClick={props.onClick}
        >
          {/* Icon with notification indicator */}
          <span class="relative flex-shrink-0">
            <Dynamic component={Icon} class="size-4" />
            <Show when={props.item.notification}>
              <NotificationIndicator priority={props.item.notification!} />
            </Show>
          </span>
          <span class="truncate flex-1">{props.item.label}</span>
          <Show when={!props.showShortcutHint}>
            <SplitIndicator indices={splitIndices()} />
          </Show>
          <Show when={props.showShortcutHint && shortcutKey()}>
            <ShortcutHint key={shortcutKey()} />
          </Show>
        </button>
        {/* Unpin button - shows on hover */}
        <button
          type="button"
          class="absolute right-1 top-1/2 -translate-y-1/2 size-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-ink/20 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            props.onUnpin();
          }}
        >
          <PushPinIcon class="size-3 text-ink-muted" />
        </button>
      </div>
    </Tooltip>
  );
};

/**
 * Get split indices where a pinned item (entity) is currently open
 */
function getSplitIndicesForEntity(type: string, entityId: string): number[] {
  const manager = globalSplitManager();
  if (!manager) return [];
  
  const splits = manager.splits();
  const indices: number[] = [];
  
  splits.forEach((split, index) => {
    if (split.content.type === type && split.content.id === entityId) {
      indices.push(index + 1); // 1-indexed for display
    }
  });
  
  return indices;
}

interface SplitIndicatorProps {
  indices: number[];
}

const SplitIndicator: Component<SplitIndicatorProps> = (props) => {
  return (
    <Show when={props.indices.length > 0}>
      <span class="ml-auto text-[10px] text-accent/70 font-medium">
        {props.indices.join(', ')}
      </span>
    </Show>
  );
};

interface SidebarViewItemProps {
  view: PredefinedView;
  index: number;
  onClick: () => void;
  showShortcutHint?: boolean;
}

const SidebarViewItem: Component<SidebarViewItemProps> = (props) => {
  const splitIndices = createMemo(() => {
    // Subscribe to activeViewsBySplit changes
    activeViewsBySplit();
    const manager = globalSplitManager();
    if (!manager) return [];
    const splitIds = manager.splits().map(s => s.id) as SplitId[];
    return getSplitIndicesForView(props.view.id, splitIds);
  });

  // Check if this view is active in the current active split
  const isActive = createMemo(() => {
    const manager = globalSplitManager();
    if (!manager) return false;
    const activeSplitId = manager.activeSplitId();
    if (!activeSplitId) return false;
    
    // For standalone views (like briefing), check if the split content matches
    const STANDALONE_VIEWS = ['briefing', 'briefing2'];
    if (STANDALONE_VIEWS.includes(props.view.id)) {
      const split = manager.getSplit(activeSplitId);
      if (!split) return false;
      const content = split.content();
      return content.type === 'component' && content.id === props.view.id;
    }
    
    // For filter-based views, check the activeViewsBySplit registry
    const views = activeViewsBySplit();
    return views.get(activeSplitId) === props.view.id;
  });

  // Use view's shortcut if defined, otherwise fall back to index-based key
  const shortcutKey = () => props.view.shortcut ?? formatIndexKey(props.index);
  
  return (
    <Tooltip
      tooltip={
        <LabelAndHotKey
          label={props.view.description ?? props.view.label}
          shortcut={shortcutKey() ? shortcutKey() : undefined}
        />
      }
      placement="right"
    >
      <button
        type="button"
        class="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors"
        classList={{
          'bg-ink/10 text-ink': isActive(),
          'text-ink-muted hover:bg-ink/10 hover:text-ink': !isActive(),
        }}
        onClick={props.onClick}
      >
        <Dynamic component={props.view.icon} class="size-4 flex-shrink-0" />
        <span class="truncate">{props.view.label}</span>
        <Show when={!props.showShortcutHint}>
          <SplitIndicator indices={splitIndices()} />
        </Show>
        <Show when={props.showShortcutHint && shortcutKey()}>
          <ShortcutHint key={shortcutKey()} />
        </Show>
      </button>
    </Tooltip>
  );
};

interface ShortcutHintProps {
  key: string;
}

/**
 * Small badge showing the shortcut key when the "v" leader is active
 */
const ShortcutHint: Component<ShortcutHintProps> = (props) => {
  return (
    <span class="ml-auto px-1 py-0.5 text-[10px] font-mono font-medium bg-accent text-page rounded">
      {props.key}
    </span>
  );
};

export default SoupSidebar;
