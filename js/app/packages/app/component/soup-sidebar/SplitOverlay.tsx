import {
  type Component,
  Show,
  For,
  createMemo,
  createEffect,
  createSignal,
  onCleanup,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  pendingView,
  setPendingView,
  setApplyViewToSplit,
  pendingPinnedItem,
  setPendingPinnedItem,
} from './sidebar-selection-state';
import { globalSplitManager } from '@app/signal/splitLayout';
import type {
  SplitContent,
  SplitState,
  SplitId,
} from '@app/component/split-layout/layoutManager';

/**
 * Check if the split content is a list component (unified-list or soup-sidebar)
 */
function isListComponent(content: SplitContent): boolean {
  return (
    content.type === 'component' &&
    (content.id === 'unified-list' || content.id === 'soup-sidebar')
  );
}

/**
 * Views that should navigate to their own component instead of applying filters
 */
const STANDALONE_VIEWS = ['briefing', 'briefing2'] as const;

/**
 * Get a display name for split content
 */
function getContentDisplayName(content: SplitContent): string {
  if (content.type === 'component') {
    // Format component IDs nicely
    return content.id
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  // For blocks, use the type name
  return content.type.charAt(0).toUpperCase() + content.type.slice(1);
}

interface SplitOverlayItemProps {
  split: SplitState;
  index: number;
  onSelect: () => void;
}

const SplitOverlayItem: Component<SplitOverlayItemProps> = (props) => {
  const contentName = createMemo(() =>
    getContentDisplayName(props.split.content)
  );
  const [rect, setRect] = createSignal<DOMRect | null>(null);

  // Find and track the split element's position
  createEffect(() => {
    const el = document.querySelector(
      `[data-split-id="${props.split.id}"]`
    ) as HTMLElement | null;
    if (el) {
      setRect(el.getBoundingClientRect());
    }
  });

  return (
    <Show when={rect()}>
      {(r) => (
        <div
          class="fixed bg-panel/60 z-50 flex items-center justify-center cursor-pointer transition-colors hover:bg-accent/20"
          style={{
            top: `${r().top}px`,
            left: `${r().left}px`,
            width: `${r().width}px`,
            height: `${r().height}px`,
          }}
          onClick={(e) => {
            e.stopPropagation();
            props.onSelect();
          }}
        >
          <div class="text-center pointer-events-none">
            <div class="text-6xl font-bold text-ink/50 mb-2">
              {props.index + 1}
            </div>
            <div class="text-lg font-medium text-ink-muted">
              {contentName()}
            </div>
          </div>
        </div>
      )}
    </Show>
  );
};

/**
 * Renders overlays on all splits when a sidebar view or pinned item is being selected.
 * Each overlay shows the split index and current content name.
 * Clicking an overlay applies the selected view/item to that split.
 */
export const SplitOverlays: Component = () => {
  const manager = globalSplitManager;
  const view = pendingView;
  const pinnedItem = pendingPinnedItem;

  // Check if any selection is pending
  const hasPendingSelection = createMemo(() => !!view() || !!pinnedItem());

  const handleSplitSelectForView = (
    splitId: SplitId,
    content: SplitContent
  ) => {
    const currentView = view();
    const splitManager = manager();

    if (!currentView || !splitManager) {
      return;
    }

    const split = splitManager.getSplit(splitId);
    if (!split) {
      return;
    }

    // Check if this view should navigate to its own component (like briefing)
    if (
      STANDALONE_VIEWS.includes(
        currentView.id as (typeof STANDALONE_VIEWS)[number]
      )
    ) {
      split.replace({
        next: {
          type: 'component',
          id: currentView.id,
        },
        referredFrom: 'launcher',
      });
      setPendingView(null);
      return;
    }

    // Check if the split already has a list component
    if (isListComponent(content)) {
      // Signal to the existing soup to apply the new filters
      setApplyViewToSplit({ splitId, view: currentView });
    } else {
      // Replace with soup-sidebar component
      split.replace({
        next: {
          type: 'component',
          id: 'soup-sidebar',
          params: { viewId: currentView.id },
        },
        referredFrom: 'launcher',
      });

      // Also signal to apply filters after component mounts
      setTimeout(() => {
        setApplyViewToSplit({ splitId, view: currentView });
      }, 100);
    }

    // Clear the pending view
    setPendingView(null);
  };

  const handleSplitSelectForPinnedItem = (splitId: SplitId) => {
    const item = pinnedItem();
    const splitManager = manager();

    if (!item || !splitManager) {
      return;
    }

    const split = splitManager.getSplit(splitId);
    if (!split) {
      return;
    }

    // Replace with the pinned item's block
    split.replace({
      next: {
        type: item.type,
        id: item.entityId,
      },
      referredFrom: 'launcher',
    });

    // Clear the pending pinned item
    setPendingPinnedItem(null);
  };

  const handleSplitSelect = (splitId: SplitId, content: SplitContent) => {
    if (view()) {
      handleSplitSelectForView(splitId, content);
    } else if (pinnedItem()) {
      handleSplitSelectForPinnedItem(splitId);
    }
  };

  const handleSelectByIndex = (index: number) => {
    const splits = manager()?.splits();
    if (!splits || index < 0 || index >= splits.length) return;

    const split = splits[index];
    handleSplitSelect(split.id, split.content);
  };

  const handleBackdropClick = () => {
    setPendingView(null);
    setPendingPinnedItem(null);
  };

  // Handle keyboard input for selecting splits by number
  createEffect(() => {
    if (!hasPendingSelection()) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if it's a number key 1-9
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        handleSelectByIndex(num - 1); // Convert to 0-based index
      } else if (e.key === 'Escape') {
        setPendingView(null);
        setPendingPinnedItem(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  const splits = createMemo(() => manager()?.splits() ?? []);

  return (
    <Show when={hasPendingSelection()}>
      <Portal>
        {/* Backdrop to close on click outside - lower z-index than overlays */}
        <div class="fixed inset-0 z-40" onClick={handleBackdropClick} />

        {/* Render overlay on each split - higher z-index */}
        <For each={splits()}>
          {(split, index) => (
            <SplitOverlayItem
              split={split}
              index={index()}
              onSelect={() => handleSplitSelect(split.id, split.content)}
            />
          )}
        </For>
      </Portal>
    </Show>
  );
};

export default SplitOverlays;
