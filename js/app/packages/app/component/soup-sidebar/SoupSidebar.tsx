import {
  VIEW_GROUPS,
  getViewsForGroup,
  type PredefinedView,
} from './predefined-views';
import { useSoup } from '@app/component/next-soup/soup-context';
import { LabelAndHotKey, Tooltip } from '@core/component/Tooltip';
import PlusIcon from '@macro-icons/wide/plus.svg';
import PinIcon from '@macro-icons/pixel/pin.svg';
import UnpinIcon from '@macro-icons/pixel/unpin.svg';
import { type Component, createSignal, For, createMemo, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { setCreateMenuOpen } from '@app/component/Launcher';

export interface SoupSidebarProps {
  /** Whether the sidebar is pinned open */
  pinned?: boolean;
  /** Callback when pinned state changes */
  onPinnedChange?: (pinned: boolean) => void;
  /** Callback when a view with contextual filters is selected */
  onViewSelect?: (view: PredefinedView) => void;
}

/**
 * Collapsible sidebar for the soup view, inspired by Linear's UI.
 * Shows predefined views with filters and a create button.
 *
 * Behavior:
 * - By default floats over content (overlay mode)
 * - Shows a thin collapsed bar on the left when not hovered
 * - Expands as an overlay when hovered
 * - When pinned, pushes the content to the right (inline mode)
 */
export const SoupSidebar: Component<SoupSidebarProps> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);
  const [isPinned, setIsPinned] = createSignal(props.pinned ?? false);
  const [activeViewId, setActiveViewId] = createSignal<string | undefined>();

  const soup = useSoup();

  // Sidebar is expanded when hovered OR pinned
  const isExpanded = createMemo(() => isPinned() || isHovered());

  const handlePinToggle = () => {
    const newPinned = !isPinned();
    setIsPinned(newPinned);
    props.onPinnedChange?.(newPinned);
  };

  const handleViewClick = (view: PredefinedView) => {
    // Clear existing filters
    soup.filters.clear();

    // Activate view filters
    for (const filterId of view.filters) {
      soup.filters.activate(filterId);
    }

    // Set sort if specified
    if (view.sort) {
      soup.sort.setAll([view.sort]);
    }

    setActiveViewId(view.id);

    // Notify parent about the view selection (for contextual filters)
    props.onViewSelect?.(view);
  };

  const handleCreateClick = () => {
    setCreateMenuOpen(true);
  };

  return (
    <>
      {/* 
        Wrapper container - when pinned, takes up space in layout (pushes content).
        When not pinned, has zero width so sidebar floats over content.
      */}
      <div
        class="relative h-full flex-shrink-0 z-20"
        classList={{
          'w-48': isPinned(),
          'w-0': !isPinned(),
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Hover trigger zone - extends slightly into content area when collapsed */}
        <Show when={!isPinned()}>
          <div
            class="absolute left-0 top-0 h-full w-3 z-10"
            onMouseEnter={() => setIsHovered(true)}
          />
        </Show>

        {/* Collapsed bar - only visible when not expanded and not pinned */}
        <div
          class="absolute left-0 top-0 h-full w-2 bg-panel border-r border-edge-muted transition-opacity duration-200"
          classList={{
            'opacity-100': !isExpanded(),
            'opacity-0 pointer-events-none': isExpanded(),
          }}
        >
          {/* Visual indicator dots when collapsed */}
          <div class="flex flex-col items-center gap-1.5 pt-3">
            <div class="w-1 h-1 rounded-full bg-edge" />
            <div class="w-1 h-1 rounded-full bg-edge" />
            <div class="w-1 h-1 rounded-full bg-edge" />
          </div>
        </div>

        {/* Expanded sidebar */}
        <div
          class="h-full bg-panel border-r border-edge-muted transition-all duration-200 ease-out overflow-hidden"
          classList={{
            // When expanded: full width
            'w-48': isExpanded(),
            // When collapsed: thin bar
            'w-2': !isExpanded(),
            // When not pinned and expanded: position absolute to float over content
            'absolute left-0 top-0 shadow-lg': !isPinned() && isExpanded(),
          }}
        >
          <div
            class="h-full flex flex-col transition-opacity duration-150"
            classList={{
              'opacity-100': isExpanded(),
              'opacity-0 pointer-events-none': !isExpanded(),
            }}
          >
            {/* Header with Create and Pin buttons */}
            <div class="p-2 border-b border-edge-muted">
              <div class="flex items-center gap-1">
                <Tooltip
                  tooltip={<LabelAndHotKey label="Create new" shortcut="c" />}
                >
                  <button
                    type="button"
                    class="flex-1 flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-ink hover:bg-hover rounded transition-colors"
                    onClick={handleCreateClick}
                  >
                    <PlusIcon class="size-4 text-accent" />
                    <span>Create</span>
                  </button>
                </Tooltip>
                <Tooltip
                  tooltip={
                    <LabelAndHotKey
                      label={isPinned() ? 'Unpin sidebar' : 'Pin sidebar open'}
                      shortcut="["
                    />
                  }
                >
                  <button
                    type="button"
                    class="p-1.5 rounded transition-colors"
                    classList={{
                      'bg-accent/10 text-accent': isPinned(),
                      'text-ink-muted hover:text-ink hover:bg-hover': !isPinned(),
                    }}
                    onClick={handlePinToggle}
                  >
                    <Show
                      when={isPinned()}
                      fallback={<PinIcon class="size-4 rotate-45" />}
                    >
                      <UnpinIcon class="size-4" />
                    </Show>
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* View groups */}
            <div class="flex-1 overflow-y-auto py-2">
              <For each={VIEW_GROUPS}>
                {(group) => (
                  <SidebarViewGroup
                    groupId={group.id}
                    label={group.label}
                    views={getViewsForGroup(group.id)}
                    activeViewId={activeViewId()}
                    onViewClick={handleViewClick}
                  />
                )}
              </For>
            </div>
          </div>
        </div>
      </div>

      {/* Backdrop overlay when floating and expanded - click to close */}
      <Show when={!isPinned() && isExpanded()}>
        <div
          class="fixed inset-0 z-10"
          onClick={() => setIsHovered(false)}
          onMouseEnter={() => setIsHovered(false)}
        />
      </Show>
    </>
  );
};

interface SidebarViewGroupProps {
  groupId: string;
  label: string;
  views: PredefinedView[];
  activeViewId: string | undefined;
  onViewClick: (view: PredefinedView) => void;
}

const SidebarViewGroup: Component<SidebarViewGroupProps> = (props) => {
  return (
    <div class="mb-2">
      <div class="px-3 py-1 text-xs font-medium text-ink-muted uppercase tracking-wider">
        {props.label}
      </div>
      <div class="flex flex-col">
        <For each={props.views}>
          {(view) => (
            <SidebarViewItem
              view={view}
              isActive={props.activeViewId === view.id}
              onClick={() => props.onViewClick(view)}
            />
          )}
        </For>
      </div>
    </div>
  );
};

interface SidebarViewItemProps {
  view: PredefinedView;
  isActive: boolean;
  onClick: () => void;
}

const SidebarViewItem: Component<SidebarViewItemProps> = (props) => {
  return (
    <Tooltip
      tooltip={
        <LabelAndHotKey
          label={props.view.description ?? props.view.label}
          shortcut={props.view.shortcut}
        />
      }
      placement="right"
    >
      <button
        type="button"
        class="w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors"
        classList={{
          'bg-accent/10 text-accent': props.isActive,
          'text-ink hover:bg-hover': !props.isActive,
        }}
        onClick={props.onClick}
      >
        <Dynamic component={props.view.icon} class="size-4 flex-shrink-0" />
        <span class="truncate">{props.view.label}</span>
      </button>
    </Tooltip>
  );
};

export default SoupSidebar;
