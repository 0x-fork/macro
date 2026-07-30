import {
  isListViewID,
  LIST_VIEWS,
  type ListView,
} from '@app/constants/list-views';
import { GettingStarted } from '@app/features/getting-started';
import { Home } from '@app/features/home';
import { queryStateFrom } from '@app/features/next-soup/filters/filter-store';
import type { SetPredicatesInput } from '@app/features/next-soup/filters/filter-store/predicates-store';
import { mergeQuery } from '@app/features/next-soup/filters/filter-store/query-store';
import type { Query } from '@app/features/next-soup/filters/filter-store/types';
import { getViewPreset } from '@app/features/next-soup/sidebar/soup-filter-presets';
import { NonMemberChannelPreview } from '@app/features/next-soup/soup-view/non-member-channel-preview';
import { SoupView } from '@app/features/next-soup/soup-view/soup-view';
import { SettingsPanelComponentWrapper } from '@app/features/settings/Settings';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { globalSplitManager } from '@app/signal/splitLayout';
import { ChannelCompose } from '@block-channel/component/Compose';
import { EmailCompose } from '@block-email/component/compose/Compose';
import { ComposeTask } from '@block-md/component/ComposeTask';
import {
  CRM_VIEW_URL_PARAM,
  type CrmViewConfig,
  decodeCrmViewParam,
} from '@companies/crm/saved-views';
import { useIsAuthenticated } from '@core/auth';
import { LoadingBlock } from '@core/component/LoadingBlock';
import {
  DEV_MODE_ENV,
  ENABLE_ACTIVITY,
  ENABLE_CRM,
  ENABLE_SPLIT_MOUNT_REUSE,
  LOCAL_ONLY,
} from '@core/constant/featureFlags';
import { useUserContext } from '@core/context/user';
import type { ViewId } from '@core/types/view';
import EmptyStatePreviewIcon from '@design/empty-state-doc.svg';
import { useAutomationEntities } from '@queries/agent-schedule/entities';
import { EmptyStatePanel } from '@ui';
import {
  type Component,
  createEffect,
  createMemo,
  type JSXElement,
  lazy,
  on,
  onMount,
  Show,
} from 'solid-js';
import type { SplitContent } from './layoutManager';
import { useSplitPanelOrThrow } from './layoutUtils';
import { previewEmptyStateForContent } from './previewController';

function usePageViewTracking(pageTitle: string) {
  const analytics = useAnalytics();
  onMount(() => {
    analytics.pageView(pageTitle);
    analytics.track('open_view', { viewId: pageTitle });
  });
}

/**
 * Guard that delays rendering until user is authenticated.
 * Use for components that require user context (userId, email).
 */
const withAuth = <P extends object>(Comp: Component<P>): Component<P> => {
  return (props: P) => {
    const isAuthenticated = useIsAuthenticated();
    return (
      <Show when={isAuthenticated()} fallback={<LoadingBlock />}>
        <Comp {...props} />
      </Show>
    );
  };
};

type ComponentFactory = (params?: Record<string, any>) => JSXElement;

function mergeClientFilters(
  base?: SetPredicatesInput<string>,
  refinement?: SetPredicatesInput<string>
): SetPredicatesInput<string> | undefined {
  if (!base) return refinement;
  if (!refinement) return base;

  return {
    and: [...new Set([...(base.and ?? []), ...(refinement.and ?? [])])],
    or: [...new Set([...(base.or ?? []), ...(refinement.or ?? [])])],
  };
}

export type UnifiedListMeta = {
  kind: 'unified-list';
  viewId: ViewId;
};

export type ComponentMeta = UnifiedListMeta | { kind?: undefined };

export type ComponentMetaMap = {
  'unified-list': UnifiedListMeta;
};

/**
 * Mount families: components that share a family render through one factory
 * that reads the split's current content reactively. Navigating a split
 * between two members keeps the mounted element alive (no unmount/remount) —
 * see `reattach` in layoutManager. Family factories must therefore derive
 * everything view-specific from `panel.handle.content()`, never from the
 * one-shot `params` argument.
 */
type ComponentFamily = 'soup-list';

type ComponentRegistration = {
  factory: ComponentFactory;
  initialMeta?: ComponentMeta;
  family?: ComponentFamily;
};

const REGISTRY = new Map<string, ComponentRegistration>();

function registerComponent<T extends Omit<ComponentMeta, 'kind'>>(
  name: string,
  factory: ComponentFactory,
  initialMeta?: T,
  options?: { family?: ComponentFamily }
) {
  const metaWithKind = initialMeta ? { kind: name, ...initialMeta } : undefined;
  REGISTRY.set(name, {
    factory,
    initialMeta: metaWithKind as ComponentMeta,
    family: options?.family,
  });
}

/**
 * The mount family a component belongs to, if any. Gated on the rollout flag
 * at call time (navigation), so turning the flag off restores the historical
 * unmount/remount behavior without touching registrations.
 */
export function componentFamilyOf(name: string): ComponentFamily | undefined {
  if (!ENABLE_SPLIT_MOUNT_REUSE()) return undefined;
  return REGISTRY.get(name)?.family;
}

type ResolvedComponent = {
  element: () => JSXElement;
  initialMeta?: ComponentMeta;
};

// Similar to SolidRouter's `<Navigate />` but for splits
function RedirectSplit(props: { to: SplitContent }) {
  const panel = useSplitPanelOrThrow();

  onMount(() => {
    panel.handle.replace({ next: props.to });
  });

  return null;
}

export function resolveComponent(
  name: string,
  params?: Record<string, any>
): ResolvedComponent {
  const registration = REGISTRY.get(name);
  if (!registration) throw new Error(`Component '${name}' not registered`);
  return {
    element: () => registration.factory(params),
    initialMeta: registration.initialMeta,
  };
}

registerComponent('unified-list', () => (
  <RedirectSplit to={{ type: 'component', id: 'inbox' }} />
));

const LIST_VIEW_NAMES: Record<ListView, string> = {
  inbox: 'Inbox',
  agents: 'Agents',
  mail: 'Email',
  documents: 'Files',
  tasks: 'Tasks',
  channels: 'Channels',
  calls: 'Calls',
  companies: 'Customers',
  folders: 'Folders',
  search: 'Search',
};

type SoupListRouteParams = {
  initialFilters?: Query;
  initialClientFilters?: SetPredicatesInput<string>;
  initialQuery?: string;
};

/**
 * Shared route for every soup list view (`soup-list` mount family). One
 * mounted instance serves all of them: the active view id, its preset, and
 * any navigation params are derived reactively from the split's current
 * content, so a family navigation (e.g. channels → tasks) re-parameterizes
 * this component instead of unmounting it. `SoupView` re-initializes itself
 * whenever the content id changes.
 */
const SoupListRoute = withAuth(() => {
  const panel = useSplitPanelOrThrow();
  const analytics = useAnalytics();
  const user = useUserContext();

  const view = createMemo<ListView | undefined>(() => {
    const content = panel.handle.content();
    if (content.type !== 'component') return undefined;
    return isListViewID(content.id) ? content.id : undefined;
  });

  const automationEntities = useAutomationEntities(() => view() === 'agents');

  // One-shot navigation params (documents/search refinements). Stripped by
  // the layout manager on history re-attach, exactly like remounted routes.
  const routeParams = createMemo<SoupListRouteParams>(() => {
    const content = panel.handle.content();
    if (content.type !== 'component') return {};
    return (content.params ?? {}) as SoupListRouteParams;
  });

  createEffect(
    on(view, (id) => {
      if (!id) return;
      analytics.pageView(id);
      analytics.track('open_view', { viewId: id });
    })
  );

  const preset = createMemo(() => {
    const id = view();
    if (!id) return undefined;
    return getViewPreset(id, undefined, {
      userId: user.userId(),
      isTeamAdmin: false,
    });
  });

  const initialFilters = createMemo<Query | undefined>(() => {
    const id = view();
    const presetFilters = preset()?.filters;
    const paramFilters = routeParams().initialFilters;
    if (id === 'documents') {
      // Sidebar sub-entries (e.g. Markdown docs) refine the base preset.
      return presetFilters && paramFilters
        ? mergeQuery(queryStateFrom(presetFilters), paramFilters)
        : (paramFilters ?? presetFilters);
    }
    if (id === 'search') return paramFilters ?? presetFilters;
    return presetFilters;
  });

  const initialClientFilters = createMemo<
    SetPredicatesInput<string> | undefined
  >(() => {
    const id = view();
    const presetPredicates = preset()?.clientFilters;
    const paramPredicates = routeParams().initialClientFilters;
    if (id === 'documents') {
      return mergeClientFilters(presetPredicates, paramPredicates);
    }
    if (id === 'search') return paramPredicates ?? presetPredicates;
    return presetPredicates;
  });

  const viewName = createMemo(() => {
    const id = view();
    return id === undefined ? '' : LIST_VIEW_NAMES[id];
  });

  // Share links land on Customers as `?crmView=<encoded config>` — the param
  // carries the full view state (never data), decoded client-side.
  const initialCrmView = createMemo<CrmViewConfig | undefined>(() => {
    if (view() !== 'companies') return undefined;
    const crmViewParam = new URLSearchParams(window.location.search).get(
      CRM_VIEW_URL_PARAM
    );
    return crmViewParam ? decodeCrmViewParam(crmViewParam) : undefined;
  });

  return (
    <Show
      // Registered even when the CRM feature is off so direct navigation /
      // restored splits redirect instead of throwing in resolveComponent.
      when={!(view() === 'companies' && !ENABLE_CRM())}
      fallback={<RedirectSplit to={{ type: 'component', id: 'inbox' }} />}
    >
      <SoupView
        viewName={viewName()}
        initialFilters={initialFilters()}
        initialClientFilters={initialClientFilters()}
        initialSearchText={
          view() === 'search' ? routeParams().initialQuery : undefined
        }
        initialGroupBy={preset()?.groupBy}
        disableLocalSearch={view() === 'inbox'}
        additionalEntities={
          view() === 'agents' ? automationEntities : undefined
        }
        initialCrmView={initialCrmView()}
      />
    </Show>
  );
});

for (const id of LIST_VIEWS) {
  registerComponent(id, SoupListRoute, undefined, { family: 'soup-list' });
}

/** BEGIN - APP ROUTES */
registerComponent(
  'home',
  withAuth(() => {
    usePageViewTracking('home');
    return <Home />;
  })
);

registerComponent(
  'getting-started',
  withAuth(() => {
    usePageViewTracking('getting-started');
    return <GettingStarted />;
  })
);

const ActivityView = lazy(() =>
  import('@app/features/activity-timeline/activity-view').then((module) => ({
    default: module.ActivityView,
  }))
);

registerComponent(
  'activity',
  withAuth(() => {
    // Keep the registration so direct navigation and restored splits can
    // recover safely without loading the data-owning Activity view.
    if (!ENABLE_ACTIVITY) {
      return <RedirectSplit to={{ type: 'component', id: 'inbox' }} />;
    }
    usePageViewTracking('activity');
    return <ActivityView />;
  })
);

// The Activity tab briefly shipped as two separate views; restored splits
// may still reference their ids.
registerComponent('firehose', () => (
  <RedirectSplit to={{ type: 'component', id: 'activity' }} />
));
registerComponent('my-activity', () => (
  <RedirectSplit to={{ type: 'component', id: 'activity' }} />
));

/** END - APP ROUTES */

registerComponent('loading', () => <LoadingBlock />);
// Placeholder a Preview Pair's Viewer opens before its Controller has
// navigated anywhere (see layoutManager engagePreviewMode). Controllers can
// override the copy via `emptyState` in previewController.ts; resolving it
// from the live pair (rather than params) keeps the override across URL
// restore.
registerComponent('preview-empty', () => {
  const panel = useSplitPanelOrThrow();
  onMount(() => panel.handle.setDisplayName('Preview'));
  const emptyState = () => {
    const manager = globalSplitManager();
    const controllerId = manager?.controllerOf(panel.handle.id);
    const controllerContent = controllerId
      ? manager?.getSplit(controllerId)?.content()
      : undefined;
    return controllerContent
      ? previewEmptyStateForContent(controllerContent)
      : undefined;
  };
  return (
    <EmptyStatePanel
      graphic={EmptyStatePreviewIcon}
      title={emptyState()?.title ?? 'No content selected'}
      description={
        emptyState()?.description ??
        'Select an item from the connected list to preview it here'
      }
      centered
    />
  );
});
// Join prompt for a channel the viewer can see but hasn't joined, shown in a
// Preview Pair's Viewer when the controlling list focuses such a row (see
// openEntityInSplitFromUnifiedList). Params don't round-trip through the URL,
// so a restored split has none — fall back to the placeholder and let the
// controller's focus→preview effect re-open the real prompt.
registerComponent('non-member-channel', (params) => {
  const panel = useSplitPanelOrThrow();
  const channelId =
    typeof params?.channelId === 'string' ? params.channelId : undefined;
  if (!channelId) {
    return <RedirectSplit to={{ type: 'component', id: 'preview-empty' }} />;
  }
  const channelName =
    typeof params?.channelName === 'string' ? params.channelName : 'Channel';
  const memberCount =
    typeof params?.memberCount === 'number' ? params.memberCount : 0;
  onMount(() => panel.handle.setDisplayName(channelName));
  return (
    <NonMemberChannelPreview
      channelId={channelId}
      channelName={channelName}
      memberCount={memberCount}
      // Join landed — hand the Viewer off to the real channel block in place.
      onJoined={() =>
        panel.handle.replace({ next: { type: 'channel', id: channelId } })
      }
    />
  );
});
registerComponent('channel-compose', () => {
  usePageViewTracking('channel-compose');
  return <ChannelCompose />;
});
registerComponent('email-compose', (params) => {
  usePageViewTracking('email-compose');
  // mailto: links land here as `component/email-compose?to=a@x.com,b@y.com`.
  const toParam = new URLSearchParams(window.location.search).get('to');
  const initialTo =
    params?.initialTo ??
    toParam
      ?.split(',')
      .map((e) => e.trim())
      .filter(Boolean);
  return <EmailCompose draftID={params?.draftID} initialTo={initialTo} />;
});
registerComponent('task-compose', (params) => {
  usePageViewTracking('task-compose');
  return <ComposeTask {...params} />;
});
registerComponent(
  'import-linear',
  lazy(() => import('@app/features/integrations/import-linear/ImportLinear'))
);
registerComponent('settings', () => <SettingsPanelComponentWrapper />);

if (LOCAL_ONLY) {
  registerComponent(
    'theme-debug',
    lazy(() => import('@core/internal/ThemeDebug'))
  );
  registerComponent(
    'core',
    lazy(() => import('@core/internal/App'))
  );
  registerComponent(
    'md',
    lazy(
      () =>
        import('@core/component/LexicalMarkdown/component/debug/EditorTestPage')
    )
  );
  registerComponent(
    'data',
    lazy(() => import('@core/internal/DataDebug'))
  );
  registerComponent(
    'noise',
    lazy(() => import('@core/internal/PcNoiseGridDemo'))
  );
  registerComponent(
    'svg-noise',
    lazy(() => import('@core/internal/SvgNoiseGridDemo'))
  );
  registerComponent(
    'chat',
    lazy(() => import('@core/component/AI/component/debug/Component'))
  );

  registerComponent(
    'chat-attachment',
    lazy(() => import('@core/component/AI/component/debug/Attachment'))
  );
  registerComponent(
    'chat-tool',
    lazy(() => import('@core/component/AI/component/debug/Tool'))
  );
  registerComponent(
    'http-stream',
    lazy(() => import('@core/component/AI/component/debug/HttpStream'))
  );
  registerComponent(
    'static-markdown-stream',
    lazy(
      () => import('@core/component/AI/component/debug/StaticMarkdownStream')
    )
  );
  registerComponent(
    'resize',
    lazy(() => import('@core/internal/ResizeDemo'))
  );

  registerComponent(
    'notifications-playground',
    lazy(() =>
      import('@notifications/components/Playground').then((m) => ({
        default: m.NotificationsPlayground,
      }))
    )
  );

  registerComponent(
    'props-debug',
    lazy(() => import('@property/debug/PropertyDebug'))
  );

  registerComponent(
    'entity-debug',
    lazy(() => import('@entity/debug/DebugEntityView'))
  );

  registerComponent(
    'quick-access-list',
    lazy(() => import('@core/context/quickAccess/debug/QuickAccessAll'))
  );

  registerComponent(
    'hotkey-debugger',
    lazy(() => import('@app/features/devtools/HotkeyDebugger'))
  );

  registerComponent(
    'user-icon',
    lazy(() => import('@core/internal/UserIconDemo'))
  );

  registerComponent(
    'dynamic-ui',
    lazy(() => import('@app/features/dynamic-ui/Gallery'))
  );
}

if (DEV_MODE_ENV) {
  registerComponent(
    'document-where-playground',
    withAuth(
      lazy(
        () => import('@app/features/next-soup/debug/DocumentWherePlayground')
      )
    )
  );

  registerComponent(
    'projection-playground',
    withAuth(
      lazy(() => import('@app/features/devtools/debug/ProjectionPlayground'))
    )
  );

  // NOTE (seamus) : putting pixel icons on dev/staging for aidan
  registerComponent(
    'pixel-icon',
    lazy(() => import('@core/internal/PixelArtIconDemo'))
  );
  registerComponent(
    'md-parse',
    lazy(
      () =>
        import(
          '@core/component/LexicalMarkdown/component/debug/MarkdownParseTestPage'
        )
    )
  );
  registerComponent(
    'md-builder',
    lazy(
      () => import('@core/component/LexicalMarkdown/builder/BuilderTestPage')
    )
  );
}

// Icon gallery
registerComponent(
  'icon-gallery',
  lazy(() => import('@core/internal/IconGallery'))
);
