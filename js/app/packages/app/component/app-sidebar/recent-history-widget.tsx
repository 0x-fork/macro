import type { SidebarState } from '@app/component/app-sidebar/sidebar';
import { useAnalytics } from '@app/component/analytics-context';
import { useSplitLayout } from '@app/component/split-layout/layout';
import { itemToBlockName, itemToSafeName } from '@core/constant/allBlocks';
import { USE_MACRO_PR_SUMMARY_BLOCK } from '@core/constant/featureFlags';
import { ContextMenuContent, MenuItem } from '@core/component/ContextMenu';
import { type EntityItem, exclude, useQuickAccess } from '@core/context/quickAccess';
import { openExternalUrl } from '@core/util/url';
import { Entity, isGithubPrEntity } from '@entity';
import { globalSplitManager } from '@app/signal/splitLayout';
import { ContextMenu } from '@kobalte/core/context-menu';
import { cn, NavRow, Tooltip } from '@ui';
import { createMemo, For, Show } from 'solid-js';

/**
 * Recently viewed entities surfaced in the sidebar, mirroring the Command-K
 * "All" recency list (recent docs, channels, tasks, chats, projects, …).
 *
 * Email is intentionally excluded (it lives behind the Email link), and so is
 * `person` — matching the Command-K "All" list, where people surface under the
 * People category rather than the entity recency feed.
 */
const RECENT_BUCKETS = exclude('person', 'email');

/**
 * Open a recent entity in the split layout, reusing the Command-K selection
 * logic: PRs route to the summary block (or the external URL behind the flag),
 * everything else maps through {@link itemToBlockName}. Holding shift (or the
 * context-menu action) opens it in a new split.
 */
function openRecentEntity(
  item: EntityItem,
  openWithSplit: ReturnType<typeof useSplitLayout>['openWithSplit'],
  preferNewSplit: boolean
) {
  if (isGithubPrEntity(item.data)) {
    if (USE_MACRO_PR_SUMMARY_BLOCK) {
      openWithSplit(
        { type: 'pr', id: item.data.id },
        { referredFrom: 'sidebar', preferNewSplit }
      );
    } else {
      openExternalUrl(item.data.metadata.url);
    }
    return;
  }

  if (item.data.type === 'foreign') return;

  const blockName = itemToBlockName(item.data);
  if (!blockName) return;

  openWithSplit(
    { type: blockName, id: item.id },
    { referredFrom: 'sidebar', preferNewSplit }
  );
}

function RecentHistoryItem(props: { item: EntityItem; isSlim: boolean }) {
  const analytics = useAnalytics();
  const { openWithSplit } = useSplitLayout();

  const canOpenInNewSplit = () =>
    globalSplitManager()?.canAppendSplit() ?? true;

  const navigate = (preferNewSplit: boolean) => {
    analytics.track('sidebar_click', { view: 'recent' });
    openRecentEntity(props.item, openWithSplit, preferNewSplit);
    globalSplitManager()?.returnFocus();
  };

  const Row = () => (
    <NavRow
      draggable={false}
      class={props.isSlim ? 'justify-center' : undefined}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        navigate(e.shiftKey);
      }}
    >
      <div
        class={cn(
          'flex items-center gap-2 flex-1 min-w-0',
          props.isSlim && 'justify-center'
        )}
      >
        <div class="shrink-0 size-5 p-0.5 flex items-center justify-center text-ink-muted [&_svg]:size-4">
          <Entity.Icon entity={props.item.data} />
        </div>
        <Show when={!props.isSlim}>
          <Entity.Title entity={props.item.data} />
        </Show>
      </div>
    </NavRow>
  );

  return (
    <ContextMenu>
      <ContextMenu.Trigger class="w-full">
        <Show
          when={!props.isSlim}
          fallback={
            <Tooltip
              label={itemToSafeName(props.item.data)}
              placement="right"
              class="w-full"
            >
              <Row />
            </Tooltip>
          }
        >
          <Row />
        </Show>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenuContent class="text-xs text-ink-muted">
          <MenuItem
            text="Open in new split"
            onClick={() => navigate(true)}
            disabled={!canOpenInNewSplit()}
          />
          <MenuItem text="Open in current split" onClick={() => navigate(false)} />
        </ContextMenuContent>
      </ContextMenu.Portal>
    </ContextMenu>
  );
}

export const RecentHistoryWidget = (props: { sidebarState: SidebarState }) => {
  const quickAccess = useQuickAccess();
  const recentList = quickAccess.useList(...RECENT_BUCKETS);

  // Unopened CRM companies have no `viewedAt`; their `updatedAt` fallback would
  // surface companies the user never touched, so drop them from the recency
  // feed (they stay reachable via search), matching the Command-K behavior.
  const items = createMemo(() =>
    recentList().filter((item) =>
      item.bucket === 'crm_company' ? item.timestamps.viewedAt != null : true
    )
  );

  const isSlim = () => props.sidebarState === 'slim';

  return (
    <Show when={items().length > 0}>
      <Show
        when={!isSlim()}
        fallback={
          <section class="w-full px-2 flex flex-col items-center gap-1">
            <For each={items()}>
              {(item) => <RecentHistoryItem item={item} isSlim />}
            </For>
          </section>
        }
      >
        <section class="w-full flex flex-col px-2">
          <header class="text-xs font-medium text-ink-muted ml-2 mb-1">
            <h1>Recent</h1>
          </header>
          <ul class="flex flex-col gap-1">
            <For each={items()}>
              {(item) => (
                <li>
                  <RecentHistoryItem item={item} isSlim={false} />
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </Show>
  );
};
