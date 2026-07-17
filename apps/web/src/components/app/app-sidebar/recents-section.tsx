import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { globalSplitManager } from '@app/signal/splitLayout';
import {
  CollapsibleSidebarSection,
  type CollapsibleSidebarSectionItem,
} from '@components/app/app-sidebar/collapsible-sidebar-section';
import type { SidebarState } from '@components/app/app-sidebar/sidebar';
import { useSplitLayout } from '@components/app/split-layout/layout';
import { ContextMenuContent, MenuItem } from '@core/component/ContextMenu';
import { itemToBlockName } from '@core/constant/allBlocks';
import { USE_MACRO_PR_SUMMARY_BLOCK } from '@core/constant/featureFlags';
import {
  type EntityItem,
  exclude,
  useQuickAccess,
} from '@core/context/quickAccess';
import { openExternalUrl } from '@core/util/url';
import { Entity, isGithubPrEntity } from '@entity';
import { ContextMenu } from '@kobalte/core/context-menu';
import { cn, Dropdown, NavRow } from '@ui';
import { createMemo, onCleanup, Show } from 'solid-js';

const MAX_RECENTS = 10;

/**
 * Entities eligible for the sidebar recents list. Mirrors the command menu's
 * no-query recency list: unopened CRM companies (no `viewedAt`) would fall
 * back to `updatedAt` and surface companies the user has never touched.
 * Non-PR foreign entities are dropped too — they have no block to open, so
 * their rows would navigate nowhere.
 */
function showInRecents(item: EntityItem): boolean {
  if (item.bucket === 'crm_company') {
    return item.timestamps.viewedAt != null;
  }
  if (item.data.type === 'foreign') {
    return isGithubPrEntity(item.data);
  }
  return true;
}

const RecentRow = (props: {
  item: EntityItem;
  onOpen: (preferNewSplit: boolean) => void;
  onContextMenuOpenChange?: (open: boolean) => void;
}) => {
  const layout = useSplitLayout();
  let contextMenuOpen = false;

  const isActive = () => {
    const active = globalSplitManager()?.activeSplit()?.content();
    return (
      !!active && active.type !== 'component' && active.id === props.item.id
    );
  };

  const handleContextMenuOpenChange = (open: boolean) => {
    contextMenuOpen = open;
    props.onContextMenuOpenChange?.(open);
  };

  onCleanup(() => {
    if (contextMenuOpen) props.onContextMenuOpenChange?.(false);
  });

  const canOpenInNewSplit = () =>
    globalSplitManager()?.canAppendSplit() ?? false;
  const canOpenFullscreen = () => layout.getSplitCount() > 1;
  const openInCurrentSplit = () => props.onOpen(false);
  const openInNewSplit = () => {
    if (canOpenInNewSplit()) props.onOpen(true);
  };
  const openFullscreen = () => {
    // Foreign entities (GitHub PRs) have no plain block content; opening in
    // the current split covers both the PR-block and external-URL paths.
    const data = props.item.data;
    if (data.type === 'foreign') {
      props.onOpen(false);
      return;
    }
    const blockName = itemToBlockName(data);
    if (!blockName) return;
    layout.replaceAllSplits(
      { type: blockName, id: props.item.id },
      { referredFrom: 'sidebar' }
    );
    globalSplitManager()?.returnFocus();
  };

  return (
    <ContextMenu onOpenChange={handleContextMenuOpenChange}>
      <ContextMenu.Trigger class="w-full h-7">
        <NavRow
          draggable={false}
          active={isActive()}
          data-active={isActive() ? '' : undefined}
          class="h-7"
          fullWidth
          onClick={(e: MouseEvent) => props.onOpen(e.shiftKey)}
        >
          <div class="size-5 p-0.5 shrink-0 flex items-center justify-center text-ink-muted">
            <Entity.Icon
              entity={props.item.data}
              suppressClick
              showTooltip={false}
            />
          </div>
          <span class="min-w-0 truncate">
            <Entity.Title entity={props.item.data} />
          </span>
        </NavRow>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenuContent class="text-xs text-ink-muted">
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
};

const RecentDropdownRow = (props: {
  item: EntityItem;
  onOpen: (preferNewSplit: boolean) => void;
}) => {
  const isActive = () => {
    const active = globalSplitManager()?.activeSplit()?.content();
    return (
      !!active && active.type !== 'component' && active.id === props.item.id
    );
  };

  return (
    <Dropdown.Item
      class={cn(
        'min-h-8 gap-2 px-2.5 text-[13px]',
        isActive() &&
          'bg-ink/6 text-ink hover:bg-ink/6 data-highlighted:bg-ink/6'
      )}
      onSelect={() => props.onOpen(false)}
    >
      <div class="size-5 p-0.5 shrink-0 flex items-center justify-center text-ink-muted">
        <Entity.Icon
          entity={props.item.data}
          suppressClick
          showTooltip={false}
        />
      </div>
      <span class="min-w-0 flex-1 truncate text-ink">
        <Entity.Title entity={props.item.data} />
      </span>
    </Dropdown.Item>
  );
};

/**
 * Collapsible "Recents" sidebar section: the entities the user opened most
 * recently, sourced from the same quick-access recency list as the command
 * menu's no-query view. Collapsed by default and hidden entirely in slim mode
 * and while the recency list is empty.
 */
export const RecentsSection = (props: {
  sidebarState: SidebarState;
  onSectionOpenChange?: () => void;
  onContextMenuOpenChange?: (open: boolean) => void;
}) => {
  const analytics = useAnalytics();
  const layout = useSplitLayout();
  const quickAccess = useQuickAccess();
  const entitiesList = quickAccess.useList(...exclude('person'));

  const recentItems = createMemo((): EntityItem[] => {
    const items: EntityItem[] = entitiesList();
    return items.filter(showInRecents).slice(0, MAX_RECENTS);
  });

  const openRecent = (item: EntityItem, preferNewSplit: boolean) => {
    analytics.track('sidebar_click', { view: 'recents' });

    if (isGithubPrEntity(item.data)) {
      if (USE_MACRO_PR_SUMMARY_BLOCK) {
        layout.openWithSplit(
          { type: 'pr', id: item.data.id },
          { referredFrom: 'sidebar', preferNewSplit }
        );
        globalSplitManager()?.returnFocus();
      } else {
        openExternalUrl(item.data.metadata.url);
      }
      return;
    }

    if (item.data.type === 'foreign') return;

    const blockName = itemToBlockName(item.data);
    if (!blockName) return;
    layout.openWithSplit(
      { type: blockName, id: item.id },
      {
        referredFrom: 'sidebar',
        preferNewSplit,
        reopen: blockName === 'channel' ? 'latest' : undefined,
      }
    );
    globalSplitManager()?.returnFocus();
  };

  const sectionItems = createMemo<CollapsibleSidebarSectionItem[]>(() =>
    recentItems().map((item) => ({
      id: item.id,
      visible: () => (
        <RecentRow
          item={item}
          onOpen={(preferNewSplit) => openRecent(item, preferNewSplit)}
          onContextMenuOpenChange={props.onContextMenuOpenChange}
        />
      ),
      dropdown: () => (
        <RecentDropdownRow
          item={item}
          onOpen={(preferNewSplit) => openRecent(item, preferNewSplit)}
        />
      ),
    }))
  );

  return (
    <Show when={props.sidebarState === 'expanded' && sectionItems().length > 0}>
      <CollapsibleSidebarSection
        label="Recents"
        items={sectionItems()}
        defaultOpen={false}
        onOpenChange={() => props.onSectionOpenChange?.()}
      />
    </Show>
  );
};
