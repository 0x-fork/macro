import { ROUTER_BASE_CONCAT } from '@app/constants/routerBase';
import { mountGlobalFocusListener } from '@app/signal/focus';
import { useIsAuthenticated } from '@core/auth';
import { Resize } from '@core/component/Resize';
import type { ResizeZoneCtx } from '@core/component/Resize/types';
import { usePaywallState } from '@core/constant/PaywallState';
import { virtualKeyboardVisible } from '@core/mobile/virtualKeyboard';
import {
  GLOBAL_SIDEBAR_PANEL_ID,
  isGlobalSidebarCollapsed,
  LAYOUT_CONTEXT_ID,
  setIsGlobalSidebarCollapsed,
  setStoredGlobalSidebarWidth,
  storedGlobalSidebarWidth,
  setPersistedLayoutSizes,
} from '@core/signal/layout';
import { updateCookie } from '@core/util/cookies';
import { type RouteSectionProps, useLocation } from '@solidjs/router';
import { cn } from '@ui/utils/classname';
import { attachGlobalDOMScope } from 'core/hotkey/hotkeys';
import { createEffect, createSignal, onMount, Show, Suspense } from 'solid-js';
import CaretRight from '@icon/regular/caret-right.svg';
import Banner from './banner/Banner';
import { GlobalBulkEditEntityModal } from './bulk-edit-entity/BulkEditEntityModal';
import { GlobalShareModal } from './global-share-modal/GlobalShareModal';
import { GlobalSidebar } from './global-sidebar/GlobalSidebar';
import { CommandMenu } from './command';
import GlobalShortcuts from './GlobalHotkeys';
import { ItemDndProvider } from './ItemDragAndDrop';
import { createMenuOpen, Launcher, setCreateMenuOpen } from './Launcher';
import { Paywall } from './paywall/Paywall';
import { PropertyEditorModal } from './property-edit-modal/PropertyEditorModal';
import { SettingsWrapper } from './settings/SettingsWrapper';
import { ShortcutsHelper } from './settings/ShortcutsHelper';
import { useAppSquishHandlers } from './useAppSquishHandlers';

const AUTH_URLS = [
  `${ROUTER_BASE_CONCAT}login`,
  `${ROUTER_BASE_CONCAT}login/popup`,
  `${ROUTER_BASE_CONCAT}login/popup/success`,
  `${ROUTER_BASE_CONCAT}onboarding`,
  `${ROUTER_BASE_CONCAT}signup`,
  `${ROUTER_BASE_CONCAT}email-signup-callback`,
];

export function Layout(props: RouteSectionProps) {
  const isAuthenticated = useIsAuthenticated();
  const { paywallOpen, showPaywall } = usePaywallState();
  const location = useLocation();
  const [sidebarResizeContext, setSidebarResizeContext] = createSignal<
    ResizeZoneCtx | undefined
  >(undefined);

  useAppSquishHandlers();

  // save last_path to cookie
  createEffect(() => {
    const path = location.pathname;
    const currentDate = new Date();
    const oneYearFromNow = new Date(
      currentDate.setFullYear(currentDate.getFullYear() + 1)
    );
    const ONE_YEAR_IN_SECONDS = 31536000;
    updateCookie('last_path', path, {
      maxAge: ONE_YEAR_IN_SECONDS,
      expires: oneYearFromNow,
      path: '/',
      sameSite: 'Lax',
    });
  });

  onMount(() => {
    if (sessionStorage.getItem('showUpgradeModal') === 'true') {
      showPaywall();
      sessionStorage.removeItem('showUpgradeModal');
    }
  });

  // This effect is to handle moving from unauthenticated to authenticated
  createEffect((prevAuth: boolean | undefined) => {
    const currentAuth = isAuthenticated();
    if (prevAuth === false && currentAuth === true) {
      setPersistedLayoutSizes([1, 0]);
    }
    if (currentAuth === false) {
      setPersistedLayoutSizes([1, 0]);
    }
    return currentAuth;
  }, isAuthenticated());

  mountGlobalFocusListener();

  attachGlobalDOMScope(document.body);

  createEffect(() => {
    const width = sidebarResizeContext()?.sizeOf(GLOBAL_SIDEBAR_PANEL_ID)?.();
    if (!width || isGlobalSidebarCollapsed()) return;
    setStoredGlobalSidebarWidth(Math.round(width));
  });

  return (
    <div
      class={cn(
        'relative flex flex-col justify-between w-dvw h-[calc(var(--dvh,1dvh)*100)]',
        {
          'pb-[max(env(safe-area-inset-bottom,0px),var(--tauri-inset-bottom,0px))]':
            !virtualKeyboardVisible(),
        }
      )}
      style={{
        'padding-top':
          'max(env(safe-area-inset-top, 0px), var(--tauri-inset-top, 0px))',
        'padding-left':
          'max(env(safe-area-inset-left, 0px), var(--tauri-inset-left, 0px))',
        'padding-right':
          'max(env(safe-area-inset-right, 0px), var(--tauri-inset-right, 0px))',
      }}
    >
      <Suspense>
        <Show when={isAuthenticated()}>
          <GlobalShortcuts />
          <Suspense>
            <CommandMenu />
          </Suspense>
          <Suspense>
            <PropertyEditorModal />
          </Suspense>
          <GlobalBulkEditEntityModal />
          <GlobalShareModal />
          <ShortcutsHelper />
        </Show>
        <Show
          when={
            isAuthenticated() === false &&
            !AUTH_URLS.includes(location.pathname)
          }
        >
          <Banner />
        </Show>
      </Suspense>
      {/* <Show when={isAuthenticated() && isTutorialCompleted() === false}>
        <Onboarding />
      </Show> */}

      <Show when={paywallOpen()}>
        <Paywall />
      </Show>
      <div class="grow-1">
        <Resize.Zone
          gutter={4}
          direction="horizontal"
          class="flex-1 w-full min-h-0 font-sans text-ink caret-accent"
          id={'main-layout'}
        >
          <ItemDndProvider>
            <Resize.Panel id={LAYOUT_CONTEXT_ID} minSize={250}>
              <div class="size-full relative">
                <Show when={isGlobalSidebarCollapsed()}>
                  <button
                    type="button"
                    class="absolute top-2 left-2 z-10 size-6 rounded-md grid place-items-center text-ink-muted bg-panel border border-edge-muted/50 hover:bg-hover/40"
                    onClick={() => setIsGlobalSidebarCollapsed(false)}
                    aria-label="Expand sidebar"
                  >
                    <CaretRight class="size-4" />
                  </button>
                </Show>
                <Resize.Zone
                  id="global-layout"
                  direction="horizontal"
                  gutter={4}
                  captureResizeCtx={setSidebarResizeContext}
                  class="size-full"
                >
                  <Resize.Panel
                    id={GLOBAL_SIDEBAR_PANEL_ID}
                    minSize={100}
                    maxSize={320}
                    target={{ kind: 'px', px: storedGlobalSidebarWidth() }}
                    collapsed={isGlobalSidebarCollapsed}
                  >
                    <GlobalSidebar />
                  </Resize.Panel>
                  <Resize.Panel id="global-main-content" minSize={250}>
                    {props.children}
                  </Resize.Panel>
                </Resize.Zone>
              </div>
            </Resize.Panel>
            <SettingsWrapper />
          </ItemDndProvider>
        </Resize.Zone>
      </div>
      <Suspense>
        <Show
          when={isAuthenticated() && !AUTH_URLS.includes(location.pathname)}
        >
          <Launcher open={createMenuOpen()} onOpenChange={setCreateMenuOpen} />
        </Show>
      </Suspense>
    </div>
  );
}
