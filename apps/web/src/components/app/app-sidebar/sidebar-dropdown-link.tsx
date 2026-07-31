import { requestSearchFocus } from '@app/features/next-soup/soup-view/search-controllers';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { globalSplitManager } from '@app/signal/splitLayout';
import {
  navigateToSidebarView,
  type SidebarItem,
} from '@components/app/app-sidebar/sidebar-links';
import { useSplitLayout } from '@components/app/split-layout/layout';
import { ContextMenuContent, MenuItem } from '@core/component/ContextMenu';
import { ContextMenu } from '@kobalte/core/context-menu';
import { useLocation } from '@solidjs/router';
import { cn, Dropdown, Hotkey } from '@ui';
import { type ComponentProps, createSignal, onCleanup, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';

/**
 * A sidebar link rendered as a dropdown row: used for links that overflow out
 * of the visible sidebar — the wide sidebar's collapsed sections and the
 * narrow rail's "More" menu.
 */
export const SidebarDropdownLink = (
  props: SidebarItem & {
    onContextMenuOpenChange?: (open: boolean) => void;
  }
) => {
  const analytics = useAnalytics();
  const layout = useSplitLayout();
  const location = useLocation();
  const [isHovering, setIsHovering] = createSignal(false);
  let contextMenuOpen = false;

  const isActive = () => {
    const activeContent = globalSplitManager()?.activeSplit()?.content();
    if (!activeContent) {
      return location.pathname.split('/').filter(Boolean).includes(props.id);
    }
    return activeContent.id === props.id;
  };

  const handleContextMenuOpenChange = (open: boolean) => {
    contextMenuOpen = open;
    props.onContextMenuOpenChange?.(open);
  };

  onCleanup(() => {
    if (contextMenuOpen) props.onContextMenuOpenChange?.(false);
  });

  const open = (newSplit = false) => {
    analytics.track('sidebar_click', { view: props.id });
    const handle = navigateToSidebarView({
      viewId: props.id,
      params: props.params,
      shiftKey: newSplit,
      activeSplit: globalSplitManager()?.activeSplit(),
      openWithSplit: layout.openWithSplit,
      referredFrom: 'sidebar',
    });
    if (props.id === 'search' && handle) requestSearchFocus(handle.id);
    globalSplitManager()?.returnFocus();
    return handle;
  };

  const canOpenInNewSplit = () =>
    globalSplitManager()?.canAppendSplit() ?? false;
  const canOpenFullscreen = () => layout.getSplitCount() > 1;
  const openInNewSplit = () => {
    if (canOpenInNewSplit()) open(true);
  };
  const openInCurrentSplit = () => open(false);
  const openFullscreen = () => {
    analytics.track('sidebar_click', { view: props.id });
    const handle = layout.replaceAllSplits(
      { type: 'component', id: props.id, params: props.params },
      { referredFrom: 'sidebar' }
    );
    if (props.id === 'search' && handle) requestSearchFocus(handle.id);
    globalSplitManager()?.returnFocus();
  };

  const ContextMenuTriggerItem = (
    triggerProps: ComponentProps<typeof ContextMenu.Trigger>
  ) => (
    <ContextMenu onOpenChange={handleContextMenuOpenChange}>
      <ContextMenu.Trigger {...triggerProps} />
      <ContextMenu.Portal>
        <ContextMenuContent class="z-tool-tip! text-xs text-ink-muted">
          <MenuItem
            text="Open in new split"
            onClick={openInNewSplit}
            disabled={!canOpenInNewSplit()}
          />
          <Show when={canOpenFullscreen()}>
            <MenuItem text="Open fullscreen" onClick={openFullscreen} />
          </Show>
          <MenuItem text="Open in current split" onClick={openInCurrentSplit} />
        </ContextMenuContent>
      </ContextMenu.Portal>
    </ContextMenu>
  );

  return (
    <Dropdown.Item
      as={ContextMenuTriggerItem}
      class={cn(
        'min-h-8 gap-2 px-2.5 text-[13px]',
        isActive() &&
          'bg-ink/6 text-ink hover:bg-ink/6 data-highlighted:bg-ink/6'
      )}
      data-active={isActive() ? '' : undefined}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onSelect={openInCurrentSplit}
    >
      <Show when={props.icon}>
        <div class="shrink-0 [&_svg]:size-3.5">
          <Dynamic component={props.icon} triggerAnimation={isHovering()} />
        </div>
      </Show>
      <span class="min-w-0 flex-1 truncate text-ink">{props.label}</span>
      <Hotkey token={props.hotkeyToken} theme="subtle" class="ml-6" />
    </Dropdown.Item>
  );
};
