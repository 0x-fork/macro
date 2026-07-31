import type { ListView } from '@app/constants/list-views';
import { SoupSectionHeader } from '@app/features/next-soup/soup-view/section-header';
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
import ChevronRightIcon from '@phosphor/caret-right.svg';
import { useFavoritesData } from '@queries/favorites/favorites';
import type { Favorite } from '@service-storage/generated/schemas/favorite';
import { makePersisted } from '@solid-primitives/storage';
import { cn, Layer, Tooltip } from '@ui';
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';

/** Views in the "My views" section, in display order. */
const NAV_VIEW_ORDER: readonly ListView[] = [
  'documents',
  'tasks',
  'channels',
  'mail',
  'companies',
];

/** Nav labels that differ from the sidebar link's (Customers → Companies). */
const NAV_LABEL_OVERRIDES: Partial<Record<string, string>> = {
  companies: 'Companies',
};

// Collapse state is app-wide (not per view/entry), like the old sidebar's
// sections.
const [myViewsCollapsed, setMyViewsCollapsed] = makePersisted(
  createSignal(false),
  { name: 'soup-nav-my-views-collapsed' }
);
const [favoritesCollapsed, setFavoritesCollapsed] = makePersisted(
  createSignal(false),
  { name: 'soup-nav-favorites-collapsed' }
);

/** Collapsible section header, styled like the list's date group headers. */
const NavSectionHeader = (props: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) => (
  <SoupSectionHeader onClick={props.onToggle}>
    <Layer depth={3}>
      <div class="flex items-center justify-center size-4.5 rounded-xs group-hover/header:bg-ink/5">
        <ChevronRightIcon
          class={cn('size-2.5', { 'rotate-90': props.expanded })}
        />
      </div>
    </Layer>
    <span class="truncate">{props.label}</span>
  </SoupSectionHeader>
);

const NavRow = (props: {
  active?: boolean;
  onClick: (event: MouseEvent) => void;
  /** Hover-revealed trailing action: "kick into the main panel". */
  onKickToMain?: (event: MouseEvent) => void;
  icon: JSX.Element;
  label: string;
}) => (
  <div class="group/nav-row relative mx-2">
    <button
      type="button"
      class={cn(
        'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-sm',
        'text-ink-muted hover:bg-hover/50 hover:text-ink',
        props.active && 'bg-ink/6 text-ink'
      )}
      onClick={(event) => props.onClick(event)}
    >
      <span class="grid size-4 shrink-0 place-items-center [&_svg]:size-4">
        {props.icon}
      </span>
      <span class="min-w-0 flex-1 truncate text-left">{props.label}</span>
    </button>
    <Show when={props.onKickToMain}>
      {(onKickToMain) => (
        <Tooltip label="Open in main panel">
          <button
            type="button"
            aria-label="Open in main panel"
            class={cn(
              'absolute inset-y-0.5 right-1 hidden w-6 place-items-center rounded-md',
              'text-ink-muted group-hover/nav-row:grid hover:bg-ink/10 hover:text-ink'
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

const FavoriteRow = (props: {
  favorite: Favorite;
  active: boolean;
  onClick: (event: MouseEvent) => void;
}) => {
  const name = useFavoriteDisplayName(props.favorite);
  const dmRecipientId = useFavoriteDmRecipientId(props.favorite);

  return (
    <NavRow
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
 * The old app sidebar's nav, relocated into the list panel: a collapsible
 * "My views" section of single-line view rows, then the user's Favorites —
 * both styled like the list's date groups. A view row filters the list in
 * place — the panel switches to that view (Email → the mail inbox, etc.),
 * keeping a Preview Pair engaged — while its hover-revealed arrow kicks the
 * view's full list into the main panel instead. A favorite row opens its
 * entity in the panel's preview Viewer (the right-hand panel), engaging the
 * pair first when needed; when no Viewer can form (narrow layouts) it falls
 * back to navigating like the old sidebar did.
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

  // A view row's primary click filters the list in place, mirroring the
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

  // The row's hover-revealed arrow kicks the view's full list into the main
  // content panel (the Viewer) instead.
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
    <nav class="flex flex-col pb-1">
      <NavSectionHeader
        label="My views"
        expanded={!myViewsCollapsed()}
        onToggle={() => setMyViewsCollapsed((collapsed) => !collapsed)}
      />
      <Show when={!myViewsCollapsed()}>
        <For each={links()}>
          {(link) => (
            <NavRow
              active={currentViewId() === link.id}
              onClick={() => openView(link)}
              onKickToMain={(event) => kickViewToMain(link, event)}
              icon={<Dynamic component={link.icon} />}
              label={NAV_LABEL_OVERRIDES[link.id] ?? link.label}
            />
          )}
        </For>
      </Show>
      <Show when={(favorites()?.favorites.length ?? 0) > 0}>
        <NavSectionHeader
          label="Favorites"
          expanded={!favoritesCollapsed()}
          onToggle={() => setFavoritesCollapsed((collapsed) => !collapsed)}
        />
        <Show when={!favoritesCollapsed()}>
          <For each={favorites()?.favorites ?? []}>
            {(favorite) => (
              <FavoriteRow
                favorite={favorite}
                active={isContentActive(favoriteSplitContent(favorite))}
                onClick={(event) => openFavorite(favorite, event)}
              />
            )}
          </For>
        </Show>
      </Show>
    </nav>
  );
};
