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
import { type Component, For, Show, createMemo, onMount } from 'solid-js';
import { globalSplitManager } from '@app/signal/splitLayout';
import { Dynamic } from 'solid-js/web';
import { setCreateMenuOpen } from '@app/component/Launcher';
import { setPendingView, setPendingPinnedItem, type PinnedItem, getSplitIndicesForView, activeViewsBySplit } from './sidebar-selection-state';
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
  },
  {
    id: 'pinned-2', 
    label: '#engineering',
    type: 'channel',
    entityId: 'example-channel-id-2',
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
  },
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
  
  const handleViewClick = (view: PredefinedView) => {
    // Set the pending view to show overlays on splits
    setPendingView(view);

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

  return (
    <div class="w-48 h-full flex-shrink-0 bg-panel border-r border-edge-muted flex flex-col">
      {/* Header with logo and create button */}
      <div class="px-3 py-2 border-b border-edge-muted shrink-0 flex items-center justify-between">
        <MacroLogo class="size-5 text-accent" />
        <Tooltip
          tooltip={<LabelAndHotKey label="Create new" shortcut="c" />}
        >
          <button
            type="button"
            class="flex items-center justify-center size-7 text-ink-muted hover:text-ink hover:bg-ink/20 rounded transition-colors"
            onClick={handleCreateClick}
          >
            <PlusIcon class="size-4" />
          </button>
        </Tooltip>
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

        {/* Pinned items section */}
        <Show when={EXAMPLE_PINNED_ITEMS.length > 0}>
          <div class="mb-8">
            <div class="px-2 py-0.5 text-[10px] font-medium text-ink-extra-muted uppercase tracking-wider flex items-center">
              <span>Pinned</span>
              {/* Show "p" hint when g is active but not yet in pinned scope */}
              <Show when={isGoToActive() && !isPinnedActive()}>
                <ShortcutHint key="p" />
              </Show>
            </div>
            <div class="flex flex-col gap-0.5 mt-1">
              <For each={EXAMPLE_PINNED_ITEMS}>
                {(item, index) => (
                  <SidebarPinnedItem
                    item={item}
                    index={index()}
                    onClick={() => handlePinnedItemClick(item)}
                    showShortcutHint={isPinnedActive()}
                  />
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Views section */}
        <div class="mb-4">
          <div class="px-2 py-0.5 text-[10px] font-medium text-ink-extra-muted uppercase tracking-wider">
            Views
          </div>
          <div class="flex flex-col gap-0.5 mt-1">
            <For each={getViewsForGroup('views')}>
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
        </div>
      </div>
    </div>
  );
};

interface SidebarPinnedItemProps {
  item: PinnedItem;
  index: number;
  onClick: () => void;
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
      <button
        type="button"
        class="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition-colors text-ink-muted hover:bg-ink/10 hover:text-ink"
        onClick={props.onClick}
      >
        <Dynamic component={Icon} class="size-3.5 flex-shrink-0" />
        <span class="truncate">{props.item.label}</span>
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
        class="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition-colors text-ink-muted hover:bg-ink/10 hover:text-ink"
        onClick={props.onClick}
      >
        <Dynamic component={props.view.icon} class="size-3.5 flex-shrink-0" />
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
