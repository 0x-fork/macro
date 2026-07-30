import type { ListView } from '@app/constants/list-views';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { globalSplitManager } from '@app/signal/splitLayout';
import {
  buildSidebarLinks,
  navigateToSidebarView,
  type SidebarItem,
} from '@components/app/app-sidebar/sidebar';
import { useSplitLayout } from '@components/app/split-layout/layout';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { cn } from '@ui';
import { createMemo, For } from 'solid-js';
import { Dynamic } from 'solid-js/web';

/** Views pinned at the top of the list panel, in display order. */
const NAV_VIEW_ORDER: readonly ListView[] = [
  'inbox',
  'documents',
  'tasks',
  'channels',
  'mail',
  'agents',
  'companies',
];

/**
 * Single-line view links pinned above the list — the old app sidebar's nav
 * section, relocated into the list panel. Clicking one opens that view's
 * full list in the panel's preview Viewer (the right-hand panel), engaging
 * the pair first when needed; when no Viewer can form (narrow layouts) it
 * falls back to navigating this panel like the old sidebar did.
 */
export const SoupViewNav = () => {
  const analytics = useAnalytics();
  const panel = useSplitPanelOrThrow();
  const layout = useSplitLayout();

  const links = createMemo<SidebarItem[]>(() => {
    const all = buildSidebarLinks(false);
    return NAV_VIEW_ORDER.map((id) =>
      all.find((link) => link.id === id && !link.hiddenFromSidebar)
    ).filter((link): link is SidebarItem => link !== undefined);
  });

  const viewerContentId = () => {
    const manager = globalSplitManager();
    const viewerId = manager?.viewerOf(panel.handle.id);
    if (viewerId === undefined) return undefined;
    const content = manager?.getSplit(viewerId)?.content();
    return content?.type === 'component' ? content.id : undefined;
  };

  const openView = (link: SidebarItem, event: MouseEvent) => {
    analytics.track('sidebar_click', { view: link.id, source: 'panel-nav' });
    const manager = globalSplitManager();
    const handle = panel.handle;

    let viewerId = manager?.viewerOf(handle.id);
    if (viewerId === undefined && handle.canEngagePreview()) {
      handle.engagePreview();
      viewerId = manager?.viewerOf(handle.id);
    }
    const viewer =
      viewerId === undefined ? undefined : manager?.getSplit(viewerId);

    if (!viewer) {
      // No room for a pair — navigate this panel like the old sidebar did.
      navigateToSidebarView({
        viewId: link.id,
        params: link.params,
        shiftKey: event.shiftKey,
        activeSplit: handle,
        openWithSplit: layout.openWithSplit,
        referredFrom: 'sidebar',
      });
      return;
    }

    const current = viewer.content();
    if (current.type === 'component' && current.id === link.id) return;

    viewer.replace({
      next: { type: 'component', id: link.id, params: link.params },
      referredFrom: 'sidebar',
    });
  };

  return (
    <nav class="shrink-0 px-2 py-1.5">
      <For each={links()}>
        {(link) => {
          const isActive = () => viewerContentId() === link.id;
          return (
            <button
              type="button"
              class={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1 text-[13px] text-ink-muted',
                'hover:bg-hover/50 hover:text-ink',
                isActive() && 'bg-ink/6 text-ink'
              )}
              onClick={(event) => openView(link, event)}
            >
              <span class="shrink-0 [&_svg]:size-4">
                <Dynamic component={link.icon} />
              </span>
              <span class="min-w-0 flex-1 truncate text-left">
                {link.label}
              </span>
            </button>
          );
        }}
      </For>
    </nav>
  );
};
