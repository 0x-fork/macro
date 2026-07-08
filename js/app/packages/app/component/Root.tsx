import {
  AnalyticsContextProvider,
  useAnalytics,
} from '@app/component/analytics-context';
import { GlobalShareInboxConflictDialog } from '@app/component/ShareInboxConflictDialog';
import { DEFAULT_ROUTE } from '@app/constants/defaultRoute';
import { ROUTER_BASE } from '@app/constants/routerBase';
import { PosthogProvider, usePosthog } from '@app/lib/analytics/posthog';
import { trackSignupCompletion } from '@app/lib/analytics/signupCompletion';
import { setHotkeyRoot } from '@app/signal/hotkeyRoot';
import { globalSplitManager } from '@app/signal/splitLayout';
import { CallKitSync } from '@channel/Call';
import { CallProvider } from '@channel/Call/CallContext';
import { CallStartedNotifier } from '@channel/Call/CallStartedNotifier';
import { ChatAttachmentsInit } from '@core/component/AI/signal/globalAttachments';
import { toast } from '@core/component/Toast/Toast';
import { ToastRegion } from '@core/component/Toast/ToastRegion';
import { ChannelsContextProvider } from '@core/context/channels';
import { QuickAccessProvider } from '@core/context/quickAccess';
import { TeamContextProvider } from '@core/context/team';
import {
  UserContextProvider,
  useIsAuthenticated,
  useUserId,
  useUserInfo,
} from '@core/context/user';
import { initAndStartEmailSync, useEmailLinks } from '@core/email-link';
import { IosPushNotificationModal } from '@core/mobile/IosPushNotificationModal';
import { isNativeMobilePlatform } from '@core/mobile/isNativeMobilePlatform';
import { createBlockOrchestrator } from '@core/orchestrator';
import { formatTabTitle, tabTitleSignal } from '@core/signal/tabTitle';
import {
  getLoginCookieOptions,
  hasLoginCookie,
  syncLoginStorage,
  updateCookie,
} from '@core/util/cookies';
import { licenseChannel } from '@core/util/licenseUpdateBroadcastChannel';
import { isTauri } from '@core/util/platform';
import { transformShortIdInUrlPathname } from '@core/util/url';
import { MaybeTauriProvider } from '@macro/tauri';
import { Provider as EntityProvider } from '@macro-entity';
import {
  BrowserNotificationModal,
  createNotificationSource,
  type UnifiedNotification,
  usePlatformNotificationState,
} from '@notifications';
import { maybeHandlePlatformNotification } from '@notifications/notification-platform';
import {
  clearUser as clearDatadogUser,
  setUser as setDatadogUser,
} from '@observability';
import {
  invalidateUserInfo,
  prefetchUserInfo,
  useUserInfoQuery,
} from '@queries/auth/user-info';
import { useChatRenameWebsocketSync } from '@queries/chat';
import { prefetchHistory } from '@queries/history/history';
import { invalidateUserNotifications } from '@queries/notification/user-notifications';
import { QuerySyncProvider } from '@queries/sync/SyncProvider';
import { MutationUndoProvider } from '@queries/undo';
import { useReopenTrackedEntitiesOnReconnect } from '@service-connection/client';
import { ws as connectionGatewayWebsocket } from '@service-connection/websocket';
import { MetaProvider, Title } from '@solidjs/meta';
import {
  HashRouter,
  Navigate,
  type RouteDefinition,
  type RoutePreloadFunc,
  Router,
  type RouterProps,
  useSearchParams,
} from '@solidjs/router';
import { Button } from '@ui';
import { useHotKeyRoot } from 'core/hotkey/hotkeys';
import { detect } from 'detect-browser';
import {
  createEffect,
  createSignal,
  type JSX,
  Match,
  on,
  onCleanup,
  onMount,
  type ParentProps,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import { TauriRouteListener } from '../../tauri/src/TauriProvider';
import { currentThemeId } from '../../theme/signals/themeSignals';
import {
  applyTheme,
  ensureMinimalThemeContrast,
  systemThemeEffect,
} from '../../theme/utils/themeUtils';
import { Login } from './auth/Login';
import { MobileAuthWelcome } from './auth/mobile-onboarding/MobileAuthWelcome';
import { MobileOnboarding } from './auth/mobile-onboarding/MobileOnboarding';
import { setCookie } from './auth/Shared';
import { Signup } from './auth/Signup';
import { makeEmailAuthComponents } from './EmailAuth';
import { GlobalAppStateProvider } from './GlobalAppState';
import { InteractiveOnboardingModal } from './interactive-onboarding/InteractiveOnboardingModal';
import { Layout } from './Layout';
import { SearchProvider } from './next-soup/search-context';
import { usePendingNotificationNavigationEffect } from './PendingNotificationNavigationEffect';
import { ReactiveFavicon } from './ReactiveFavicon';
import { SettingsRoute } from './settings/SettingsRoute';
import { LAYOUT_ROUTE } from './split-layout/SplitLayoutRoute';
import { TeamInviteAcceptance } from './TeamInviteAcceptance';

/** Syncs login cookie with auth state. Only updates on successful query (not errors/loading). */
function useSyncLoginCookie() {
  const userInfoQuery = useUserInfoQuery();

  createEffect(() => {
    if (!userInfoQuery.isSuccess) return;

    const authenticated = userInfoQuery.data.authenticated ?? false;
    const { value, ...options } = getLoginCookieOptions(authenticated);
    updateCookie('login', value, options);
    syncLoginStorage(authenticated);
  });
}

const rootPreload: RoutePreloadFunc = async (args) => {
  await prefetchUserInfo();
  prefetchHistory();

  // even though we are using the transformUrl prop, we may still need to replace the url in the history
  const url = new URL(window.location.href);

  // List of query parameters to capture.
  const params = [
    'utm_campaign',
    'utm_source',
    'utm_medium',
    'utm_term',
    'utm_content',
    'rdt_cid',
    'fbclid',
    'gclid',
    'twclid',
    '_fbc',
    '_fbp',
  ];

  const searchParams = new URLSearchParams(url.search);
  params.forEach((param) => {
    const value = searchParams.get(param);
    if (value) {
      setCookie(param, value, 1); // Set the cookie to expire in 1 day.
    }
  });

  const existingPathname = url.pathname;
  const transformedPathname = transformShortIdInUrlPathname(existingPathname);
  if (existingPathname !== transformedPathname) {
    console.warn(
      `replacing url pathname from ${existingPathname} to ${transformedPathname}`
    );
    url.pathname = transformedPathname;
    window.history.replaceState(args.location.state, '', url);
  }
};

function OfflineFallback(props: { onRetry: () => Promise<unknown> }) {
  const [retrying, setRetrying] = createSignal(false);

  const handleRetry = async () => {
    setRetrying(true);
    await props.onRetry();
    setRetrying(false);
  };

  return (
    <div class="flex flex-col items-center justify-center gap-4 size-full text-ink-muted">
      <p class="text-sm">Unable to connect. Please check your network.</p>
      <Button
        class="mt-2"
        disabled={retrying()}
        onClick={handleRetry}
        variant="base"
      >
        {retrying() ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  );
}

function BasePathComponent() {
  const analytics = useAnalytics();

  const [searchParams] = useSearchParams();

  const subscriptionSuccess = searchParams.subscriptionSuccess;
  const type = searchParams.type;
  if (subscriptionSuccess === 'true') {
    toast.success('Your plan has been activated!');
    analytics.track('subscription_success', { type });
    // Invalidate user info to refresh trial status and subscription data
    invalidateUserInfo();
  }

  if (searchParams.subscriptionCancel === 'true') {
    analytics.track('subscription_cancel', { tier: searchParams.tier });
  }

  if (searchParams.upgrade === 'true') {
    sessionStorage.setItem('showUpgradeModal', 'true');
  }

  // check session storage for redirect url
  const redirectUrl = sessionStorage.getItem('redirectUrl');
  if (redirectUrl) {
    sessionStorage.removeItem('redirectUrl');
    const relativeUrl = redirectUrl.replace(window.location.origin, '');
    window.location.href = relativeUrl;
    return;
  }

  const userInfoQuery = useUserInfoQuery();

  // Preserve existing query parameters when redirecting
  const params = new URLSearchParams(window.location.search);
  const queryString =
    params.toString().length > 0 ? `?${params.toString()}` : '';
  const redirectPath = `${DEFAULT_ROUTE}${queryString}`;

  return (
    <Switch>
      <Match when={userInfoQuery.isLoading}>{null}</Match>
      <Match
        when={
          userInfoQuery.isError && hasLoginCookie() && isNativeMobilePlatform()
        }
      >
        <OfflineFallback onRetry={() => userInfoQuery.refetch()} />
      </Match>
      <Match
        when={!userInfoQuery.isLoading && !userInfoQuery.data?.authenticated}
      >
        <Navigate href={`/welcome${window.location.search}`} />
      </Match>
      <Match when={userInfoQuery.data?.authenticated}>
        <Navigate href={redirectPath} />
      </Match>
    </Switch>
  );
}

function NotFound() {
  if (isNativeMobilePlatform()) return <Navigate href={DEFAULT_ROUTE} />;
  window.location.href = window.location.origin;
  return '';
}

const { EmailCallback, CALLBACK_PATH, EmailLinkCallback, LINK_CALLBACK_PATH } =
  makeEmailAuthComponents({
    callbackPath: '/email-signup-callback',
    linkCallbackPath: '/inbox-link-callback',
    successPath: '/',
  });

const ROUTES: RouteDefinition[] = [
  LAYOUT_ROUTE,
  // Settings is its own place (`/settings/:tab`) rather than a layout split, so
  // it's linkable without dragging the workspace layout into the URL. The static
  // prefix outranks the `/*splits` splat.
  {
    path: '/settings/:tab?',
    component: SettingsRoute,
  },
  /** BEGIN - APP ROUTES */
  {
    path: '/inbox',
    component: LAYOUT_ROUTE.component,
  },
  {
    path: '/agents',
    component: LAYOUT_ROUTE.component,
  },
  {
    path: '/mail',
    component: LAYOUT_ROUTE.component,
  },
  {
    path: '/documents',
    component: LAYOUT_ROUTE.component,
  },
  {
    path: '/tasks',
    component: LAYOUT_ROUTE.component,
  },
  {
    path: '/channels',
    component: LAYOUT_ROUTE.component,
  },
  {
    path: '/calls',
    component: LAYOUT_ROUTE.component,
  },
  {
    path: '/companies',
    component: LAYOUT_ROUTE.component,
  },
  {
    path: '/files',
    component: LAYOUT_ROUTE.component,
  },
  /** END - APP ROUTES */

  {
    path: '/',
    component: BasePathComponent,
  },
  {
    path: '/signup',
    component: Signup,
  },
  {
    path: CALLBACK_PATH,
    component: EmailCallback,
  },
  {
    path: LINK_CALLBACK_PATH,
    component: EmailLinkCallback,
  },
  {
    path: '/login/popup/success',
    component: () => {
      const channel = new BroadcastChannel('auth');

      onMount(() => {
        channel.postMessage({ type: 'login-success' });
        channel.close();
        window.close();
      });

      onCleanup(() => {
        channel.close();
        window.close();
      });

      return (
        <div class="h-full overflow-y-hidden">
          <div class="relative flex flex-row items-center pt-4 h-full">
            <Button
              variant="base"
              onClick={() => {
                channel.postMessage({ type: 'login-success' });
                channel.close();
                window.close();
              }}
            >
              Close
            </Button>
          </div>
        </div>
      );
    },
  },
  {
    path: '/login',
    component: () => <Login />,
  },
  {
    path: '/welcome',
    component: () =>
      isNativeMobilePlatform() ? (
        <MobileAuthWelcome />
      ) : (
        <Navigate href="/login" />
      ),
  },
  {
    path: '/onboarding',
    component: () =>
      isNativeMobilePlatform() ? (
        <MobileOnboarding />
      ) : (
        <Navigate href="/login" />
      ),
  },
  {
    path: '/team-invite',
    component: TeamInviteAcceptance,
  },
  {
    // This splat route must be last to catch all unmatched routes
    path: '*404',
    component: NotFound,
  },
];

function ConfiguredGlobalAppStateProvider(props: ParentProps) {
  // Initialize global notification helpers
  const notifInterface = usePlatformNotificationState();
  useChatRenameWebsocketSync();
  useReopenTrackedEntitiesOnReconnect();

  const onNotification = (notification: UnifiedNotification) => {
    if (notifInterface === 'not-supported') return;
    const layoutManager = globalSplitManager();
    if (!layoutManager) return;
    maybeHandlePlatformNotification(
      notification,
      notifInterface,
      layoutManager
    );
  };
  const notificationSource = createNotificationSource(
    connectionGatewayWebsocket,
    onNotification
  );

  if (isNativeMobilePlatform()) {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        invalidateUserNotifications();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    onCleanup(() =>
      document.removeEventListener('visibilitychange', onVisibilityChange)
    );
  }

  const blockOrchestrator = createBlockOrchestrator();
  usePendingNotificationNavigationEffect(notificationSource);

  return (
    <GlobalAppStateProvider
      notificationSource={notificationSource}
      blockOrchestrator={blockOrchestrator}
    >
      {props.children}
    </GlobalAppStateProvider>
  );
}

/** Sets user info for observability, analytics, and login cookie. Must be inside QueryClientProvider. */
function UserInfoSideEffects() {
  const analytics = useAnalytics();
  const posthog = usePosthog();

  useSyncLoginCookie();

  // Set user info for observability and analytics
  const userInfo = useUserInfo();

  // Keep the active theme following the OS color scheme when auto-detect is on.
  systemThemeEffect();

  let identified = false;
  createEffect(
    on(userInfo, (user) => {
      // Keep Datadog log user context in sync with auth state: set on every
      // authenticated load (the logs SDK doesn't persist across reloads), and
      // clear on logout so logs aren't attributed to a signed-out user. Logout
      // flips userInfo client-side, and on native mobile it's an SPA navigation
      // with no page reload, so this effect is what clears it there.
      if (user?.authenticated) {
        setDatadogUser({ id: user.id, email: user.email });
      } else {
        clearDatadogUser();
      }

      if (!user || !user.authenticated) return;

      if (!posthog.instance._isIdentified() && !identified) {
        identified = true;

        const platform = detect(navigator.userAgent);
        const os = platform?.os?.replaceAll(' ', '');

        analytics.identify(user.id, {
          email: user.email,
          os,
        });
      }

      // Fires sign_up + ad conversions once when the auth service flagged this
      // session as a freshly created account (signed_up=true redirect param).
      trackSignupCompletion(analytics, { id: user.id });
    })
  );

  return null;
}

const clearBodyInlineStyleColor = () => {
  // index.html has inline script to set page color to theme surface to prevent page color flash.
  // removes page color inline style to prevent overriding main stylesheet
  document.body.style.backgroundColor = '';
};

function QuerySyncProviderWithUserId() {
  const userId = useUserId();
  return <QuerySyncProvider userId={userId} />;
}

// Provisioning the first inbox (POST /email/init) is not a side effect of
// authentication — it is hand-wired into individual login UIs. A signup that
// arrives already authenticated on /app (e.g. marketing SSO returning to the app
// root) never passes through one of those, so the inbox is never created and the
// user is stranded on the "Connect your email" empty state.
//
// Do it from one always-mounted place, gated on the durable precondition —
// authenticated with zero inboxes — not on a one-time onboarding flag. The email
// service only provisions a user who actually holds a Google grant, so this
// no-ops for anyone who declined the Gmail scope or disconnected (which removes
// the grant). Keying on "no inbox" rather than a flag also recovers users already
// stranded by this bug and re-attempts on the next load after a transient
// failure. Login and signup routes fire the same first-inbox init on their own;
// the shared in-flight guard in the email-link module collapses the overlap, so
// no route awareness is needed here.
function ProvisionFirstInbox() {
  const userInfoQuery = useUserInfoQuery();
  const { query: emailLinksQuery } = useEmailLinks();

  // One attempt per user per session. A fresh attempt happens on the next load
  // (the gate persists while no inbox exists) and on a logout→login of another user.
  let attemptedForUserId: string | undefined;

  createEffect(() => {
    const user = userInfoQuery.data;
    if (user?.authenticated !== true) return;

    // Only act on a definitive empty inbox list — never provision off a loading or
    // errored list, and stop once any inbox exists.
    if (!emailLinksQuery.isSuccess || emailLinksQuery.data.links.length > 0)
      return;

    if (attemptedForUserId === user.id) return;
    attemptedForUserId = user.id;

    void initAndStartEmailSync().match(
      () => {},
      (err) => {
        // AlreadyInitialized: a link exists server-side but our list was stale, so
        // refetch to leave the empty state. Any other failure (no grant, transient)
        // leaves the empty state — the next load re-attempts because the gate holds.
        if (err.tag === 'AlreadyInitialized') {
          void emailLinksQuery.refetch();
          return;
        }
        console.error('Failed to provision first inbox', err);
      }
    );
  });

  return null;
}

// Gates the email-links subscription (and the effect) to authenticated sessions so
// the always-mounted provider tree doesn't fetch links on the login screen.
function ProvisionFirstInboxGate() {
  const isAuthenticated = useIsAuthenticated();
  return (
    <Show when={isAuthenticated() === true}>
      <ProvisionFirstInbox />
    </Show>
  );
}

function InitialInteractiveOnboardingModal() {
  const userInfoQuery = useUserInfoQuery();
  const [open, setOpen] = createSignal(true);
  const [onboardingStarted, setOnboardingStarted] = createSignal(false);

  const modalOpen = () =>
    open() &&
    !isNativeMobilePlatform() &&
    userInfoQuery.data?.authenticated === true &&
    (userInfoQuery.data.tutorialComplete === false || onboardingStarted());

  createEffect(() => {
    if (modalOpen()) {
      setOnboardingStarted(true);
    }
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setOnboardingStarted(false);
    }
  };

  return (
    <InteractiveOnboardingModal
      open={modalOpen()}
      isFirstTimeOnboarding
      onOpenChange={handleOpenChange}
    />
  );
}

export function Root() {
  setHotkeyRoot(useHotKeyRoot());

  clearBodyInlineStyleColor();

  createEffect(() => {
    const cleanup = licenseChannel.subscribe(() => {
      invalidateUserInfo();
    });

    onCleanup(() => cleanup());
  });

  onMount(() => {
    applyTheme(currentThemeId());
    ensureMinimalThemeContrast();
  });

  const [tabInfo] = tabTitleSignal;
  const tabTitle = () => formatTabTitle(tabInfo());

  return (
    <MaybeTauriProvider>
      <MetaProvider>
        <AnalyticsContextProvider>
          <PosthogProvider>
            <EntityProvider>
              <UserContextProvider>
                <BrowserNotificationModal />
                <IosPushNotificationModal />
                <GlobalShareInboxConflictDialog />
                <QuerySyncProviderWithUserId />
                <UserInfoSideEffects />
                <ProvisionFirstInboxGate />
                <TeamContextProvider>
                  <ConfiguredGlobalAppStateProvider>
                    <MutationUndoProvider>
                      <ChannelsContextProvider>
                        <CallProvider>
                          <CallKitSync />
                          <CallStartedNotifier />
                          <QuickAccessProvider>
                            <SearchProvider>
                              <ChatAttachmentsInit />
                              <ReactiveFavicon />
                              <Title>{tabTitle()}</Title>
                              <Suspense>
                                <IsomorphicRouter
                                  transformUrl={transformShortIdInUrlPathname}
                                  root={Layout}
                                  rootPreload={rootPreload}
                                  base={ROUTER_BASE}
                                >
                                  {{
                                    path: '/',
                                    component: TauriRouteListener,
                                    children: ROUTES,
                                  }}
                                </IsomorphicRouter>
                              </Suspense>
                              <InitialInteractiveOnboardingModal />
                              <ToastRegion />
                            </SearchProvider>
                          </QuickAccessProvider>
                        </CallProvider>
                      </ChannelsContextProvider>
                    </MutationUndoProvider>
                  </ConfiguredGlobalAppStateProvider>
                </TeamContextProvider>
              </UserContextProvider>
            </EntityProvider>
          </PosthogProvider>
        </AnalyticsContextProvider>
      </MetaProvider>
    </MaybeTauriProvider>
  );
}

// A router component that correctly handles both the web and tauri routing
function IsomorphicRouter(props: RouterProps): JSX.Element {
  if (isTauri()) {
    return <HashRouter {...props} />;
  }
  return <Router {...props} />;
}
