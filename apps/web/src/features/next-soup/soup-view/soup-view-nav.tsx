import type { ListView } from '@app/constants/list-views';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import {
  favoriteIconType,
  favoriteSplitContent,
  useFavoriteDisplayName,
  useFavoriteDmRecipientId,
} from '@app/lib/utils/favorites';
import { globalSplitManager } from '@app/signal/splitLayout';
import {
  buildSidebarLinks,
  navigateToSidebarView,
  type SidebarItem,
} from '@components/app/app-sidebar/sidebar';
import { useSplitLayout } from '@components/app/split-layout/layout';
import type { SplitContent } from '@components/app/split-layout/layoutManager';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { EntityIcon } from '@core/component/EntityIcon';
import { UserIcon } from '@core/component/UserIcon';
import ArrowRightIcon from '@phosphor/arrow-right.svg';
import { useFavoritesData } from '@queries/favorites/favorites';
import type { Favorite } from '@service-storage/generated/schemas/favorite';
import { cn, Tooltip } from '@ui';
import { createMemo, For, type JSX, Show } from 'solid-js';
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

const NavPill = (props: {
  active?: boolean;
  onClick: (event: MouseEvent) => void;
  /**
   * Hover-revealed right zone of the pill: "kick into the main panel". The
   * primary click stays the whole-pill action (filtering the list).
   */
  onKickToMain?: (event: MouseEvent) => void;
  icon: JSX.Element;
  label: string;
}) => (
  <div
    class={cn(
      'group/pill relative flex min-w-0 overflow-hidden rounded-lg',
      'bg-surface ring ring-edge-muted text-ink-muted',
      props.active && 'bg-ink/6 text-ink ring-ink/15'
    )}
  >
    <button
      type="button"
      class={cn(
        'flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1.5 py-1.5 text-[13px]',
        'hover:bg-hover/50 hover:text-ink'
      )}
      onClick={(event) => props.onClick(event)}
    >
      <span class="grid size-4 shrink-0 place-items-center [&_svg]:size-4">
        {props.icon}
      </span>
      <span class="min-w-0 truncate">{props.label}</span>
    </button>
    <Show when={props.onKickToMain}>
      {(onKickToMain) => (
        <Tooltip label="Open in main panel">
          <button
            type="button"
            aria-label="Open in main panel"
            class={cn(
              'absolute inset-y-0 right-0 hidden w-[30%] min-w-7 items-center justify-center',
              'border-l border-edge-muted bg-surface text-ink-muted',
              'group-hover/pill:flex hover:bg-hover/50 hover:text-ink'
            )}
            onClick={(event) => onKickToMain()(event)}
          >
            <ArrowRightIcon class="size-3.5" />
          </button>
        </Tooltip>
      )}
    </Show>
  </div>
);

const FavoritePill = (props: {
  favorite: Favorite;
  active: boolean;
  onClick: (event: MouseEvent) => void;
}) => {
  const name = useFavoriteDisplayName(props.favorite);
  const dmRecipientId = useFavoriteDmRecipientId(props.favorite);

  return (
    <NavPill
      active={props.active}
      onClick={props.onClick}
      label={name()}
      icon={
        <Show
          when={dmRecipientId()}
          fallback={
            <EntityIcon
              targetType={favoriteIconType(props.favorite)}
              size="xs"
            />
          }
        >
          {(id) => (
            <UserIcon
              id={id()}
              class="size-4"
              size="fill"
              suppressClick
              showTooltip={false}
            />
          )}
        </Show>
      }
    />
  );
};

/**
 * The old app sidebar's nav, relocated into the list panel as an Arc-style
 * pill grid: view links first, then the user's favorites, with the column
 * count adapting to the panel width. A view pill filters the list in place —
 * the panel switches to that view (Email → the mail inbox, etc.), keeping a
 * Preview Pair engaged — while its hover-revealed right zone kicks the view's
 * full list into the main panel instead. A favorite pill opens its entity in the panel's
 * preview Viewer (the right-hand panel), engaging the pair first when
 * needed; when no Viewer can form (narrow layouts) it falls back to
 * navigating like the old sidebar did.
 *
 * Rendered inside the soup list's scroll container so it scrolls away with
 * the rows (see SoupList's `leading`).
 */
export const SoupViewNav = () => {
  const analytics = useAnalytics();
  const panel = useSplitPanelOrThrow();
  const layout = useSplitLayout();
  const favorites = useFavoritesData();

  const links = createMemo<SidebarItem[]>(() => {
    const all = buildSidebarLinks(false);
    return NAV_VIEW_ORDER.map((id) =>
      all.find((link) => link.id === id && !link.hiddenFromSidebar)
    ).filter((link): link is SidebarItem => link !== undefined);
  });

  const currentViewId = () => {
    const content = panel.handle.content();
    return content.type === 'component' ? content.id : undefined;
  };

  const viewerContent = () => {
    const manager = globalSplitManager();
    const viewerId = manager?.viewerOf(panel.handle.id);
    if (viewerId === undefined) return undefined;
    return manager?.getSplit(viewerId)?.content();
  };

  const isContentActive = (content: SplitContent) => {
    const current = viewerContent();
    return current?.type === content.type && current?.id === content.id;
  };

  /**
   * Opens content in the panel's preview Viewer, engaging the pair first
   * when needed; `fallback` runs when no Viewer can form (narrow layouts).
   */
  const openInViewer = (content: SplitContent, fallback: () => void) => {
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
      fallback();
      return;
    }

    const current = viewer.content();
    if (current.type === content.type && current.id === content.id) return;

    viewer.replace({ next: content, referredFrom: 'sidebar' });
  };

  // A view pill's primary click filters the list in place, mirroring the
  // master dropdown's Views section.
  const openView = (link: SidebarItem) => {
    if (link.id === currentViewId()) return;
    analytics.track('sidebar_click', { view: link.id, source: 'panel-nav' });
    const wasController = panel.handle.isControllerSplit();
    panel.handle.replace({
      next: { type: 'component', id: link.id, params: link.params },
      referredFrom: 'sidebar',
    });
    // A direct replace keeps the Preview Pair when the next content is still
    // a list view — clear the previous view's entity out of the Viewer.
    if (wasController) panel.handle.resetPreview();
    globalSplitManager()?.returnFocus();
  };

  // The pill's hover-revealed right zone kicks the view's full list into the
  // main content panel (the Viewer) instead.
  const kickViewToMain = (link: SidebarItem, event: MouseEvent) => {
    analytics.track('sidebar_click', {
      view: link.id,
      source: 'panel-nav-main',
    });
    openInViewer({ type: 'component', id: link.id, params: link.params }, () =>
      navigateToSidebarView({
        viewId: link.id,
        params: link.params,
        shiftKey: event.shiftKey,
        activeSplit: panel.handle,
        openWithSplit: layout.openWithSplit,
        referredFrom: 'sidebar',
      })
    );
  };

  const openFavorite = (favorite: Favorite, event: MouseEvent) => {
    analytics.track('sidebar_click', { view: 'favorite', source: 'panel-nav' });
    const content = favoriteSplitContent(favorite);
    openInViewer(content, () => {
      layout.openWithSplit(content, {
        preferNewSplit: event.shiftKey,
        referredFrom: 'sidebar',
      });
    });
  };

  return (
    // Arc-style pill grid: the column count adapts to the panel width
    // (auto-fit), so pills stay compact instead of stretching into sparse
    // full-width rows.
    <nav class="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-1.5 px-2 py-1.5">
      <For each={links()}>
        {(link) => (
          <NavPill
            active={currentViewId() === link.id}
            onClick={() => openView(link)}
            onKickToMain={(event) => kickViewToMain(link, event)}
            icon={<Dynamic component={link.icon} />}
            label={link.label}
          />
        )}
      </For>
      <For each={favorites()?.favorites ?? []}>
        {(favorite) => (
          <FavoritePill
            favorite={favorite}
            active={isContentActive(favoriteSplitContent(favorite))}
            onClick={(event) => openFavorite(favorite, event)}
          />
        )}
      </For>
    </nav>
  );
};
