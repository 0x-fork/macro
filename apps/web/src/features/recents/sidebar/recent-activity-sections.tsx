import { openEntityInSplitFromUnifiedList } from '@app/features/next-soup/utils';
import {
  bucketRecentActivity,
  buildRecentActivityArgs,
} from '@app/features/recents/recent-activity';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { globalSplitManager } from '@app/signal/splitLayout';
import {
  CollapsibleSidebarSection,
  type CollapsibleSidebarSectionItem,
} from '@components/app/app-sidebar/collapsible-sidebar-section';
import type { SidebarState } from '@components/app/app-sidebar/sidebar';
import { useSplitLayout } from '@components/app/split-layout/layout';
import type { SplitContent } from '@components/app/split-layout/layoutManager';
import { ContextMenuContent, MenuItem } from '@core/component/ContextMenu';
import { fileTypeToBlockName } from '@core/constant/allBlocks';
import type { EntityData } from '@entity';
import { EntityRowIcon } from '@entity';
import { ContextMenu } from '@kobalte/core/context-menu';
import { useSoupItemsQuery } from '@queries/soup/items';
import { NavRow } from '@ui';
import { startOfDay } from 'date-fns';
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';

const RECENT_ACTIVITY_STALE_TIME = 60 * 1000;
const DAY_TICK_INTERVAL_MS = 60 * 1000;

/**
 * The split content that opens a recent-activity row. The recents query only
 * returns documents (files/tasks/snippets) and chats, so the block name is
 * the document's sub/file type or the entity type itself.
 */
const recentEntitySplitContent = (entity: EntityData): SplitContent =>
  entity.type === 'document'
    ? {
        type: fileTypeToBlockName(entity.subType?.type ?? entity.fileType),
        id: entity.id,
      }
    : { type: fileTypeToBlockName(entity.type), id: entity.id };

/**
 * Time-bucketed recents for the expanded sidebar: Today / Yesterday /
 * Previous 7 Days / Previous 30 Days sections of what the viewer recently
 * opened, edited, or received — documents, tasks, and agents. Items can
 * appear here and in Unread; buckets older than 30 days are dropped. Hidden
 * entirely in slim mode and while there is nothing to show.
 */
export const RecentActivitySections = (props: {
  sidebarState: SidebarState;
  onContextMenuOpenChange?: (open: boolean) => void;
}) => {
  const query = useSoupItemsQuery(
    () => buildRecentActivityArgs(),
    () => ({ staleTime: RECENT_ACTIVITY_STALE_TIME })
  );

  // Re-bucket when the calendar day flips so rows drift from Today to
  // Yesterday without a reload.
  const [dayStart, setDayStart] = createSignal(
    startOfDay(new Date()).getTime()
  );
  const dayTimer = setInterval(() => {
    const next = startOfDay(new Date()).getTime();
    if (next !== dayStart()) setDayStart(next);
  }, DAY_TICK_INTERVAL_MS);
  onCleanup(() => clearInterval(dayTimer));

  const buckets = createMemo(() => {
    dayStart();
    return bucketRecentActivity(query.data ?? [], new Date());
  });

  const toSectionItems = (
    entities: readonly EntityData[]
  ): CollapsibleSidebarSectionItem[] =>
    entities.map((entity) => ({
      id: entity.id,
      visible: () => (
        <RecentEntityRow
          entity={entity}
          onContextMenuOpenChange={props.onContextMenuOpenChange}
        />
      ),
      dropdown: () => (
        <RecentEntityRow
          entity={entity}
          onContextMenuOpenChange={props.onContextMenuOpenChange}
        />
      ),
    }));

  return (
    <Show when={props.sidebarState === 'expanded' && buckets().length > 0}>
      <For each={buckets()}>
        {(bucket) => (
          <CollapsibleSidebarSection
            label={bucket.label}
            items={toSectionItems(bucket.entities)}
          />
        )}
      </For>
    </Show>
  );
};

const RecentEntityRow = (props: {
  entity: EntityData;
  onContextMenuOpenChange?: (open: boolean) => void;
}) => {
  const analytics = useAnalytics();
  const layout = useSplitLayout();

  const isActive = () => {
    const active = globalSplitManager()?.activeSplit()?.content();
    return (
      !!active && active.type !== 'component' && active.id === props.entity.id
    );
  };

  const open = (newSplit: boolean) => {
    analytics.track('sidebar_click', {
      view: 'recent-activity',
      entityType: props.entity.type,
    });
    void openEntityInSplitFromUnifiedList(props.entity, {
      openInNewSplit: newSplit,
      referredFrom: 'sidebar',
    });
    globalSplitManager()?.returnFocus();
  };

  const canOpenInNewSplit = () =>
    globalSplitManager()?.canAppendSplit() ?? false;
  const canOpenFullscreen = () => layout.getSplitCount() > 1;
  const openInCurrentSplit = () => open(false);
  const openInNewSplit = () => {
    if (canOpenInNewSplit()) open(true);
  };
  const openFullscreen = () => {
    layout.replaceAllSplits(recentEntitySplitContent(props.entity), {
      referredFrom: 'sidebar',
    });
    globalSplitManager()?.returnFocus();
  };

  return (
    <ContextMenu onOpenChange={props.onContextMenuOpenChange}>
      <ContextMenu.Trigger class="w-full h-7">
        <NavRow
          draggable={false}
          data-sidebar-recent={props.entity.id}
          data-active={isActive() ? '' : undefined}
          active={isActive()}
          class="h-7"
          fullWidth
          onClick={(e: MouseEvent) => open(e.shiftKey)}
        >
          <div class="size-5 shrink-0 flex items-center justify-center">
            <EntityRowIcon
              entity={props.entity}
              class="size-3.5"
              suppressClick
              showTooltip={false}
            />
          </div>
          <span class="min-w-0 truncate">
            {props.entity.name.trim() || 'Untitled'}
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
