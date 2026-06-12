import { createSoupState } from '@app/component/next-soup/create-soup-state';
import { SoupContextProvider } from '@app/component/next-soup/soup-context';
import { SoupViewContextProvider } from '@app/component/next-soup/soup-view/soup-view-context';
import { isListViewID, LIST_VIEW_ID } from '@app/constants/list-views';
import { splitContainerAttribute } from '@core/dom-selectors';
import { isMobile } from '@core/mobile/isMobile';
import { createElementSize } from '@solid-primitives/resize-observer';
import { cn, Panel } from '@ui';
import { useHotkeyDOMScope } from 'core/hotkey/hotkeys';
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { SplitPanelContext, type SplitPanelContextType } from '../context';
import { useSplitLayout } from '../layout';
import type { SplitHandle, SplitState } from '../layoutManager';
import { registerSplitHotkeys } from '../registerSplitHotkeys';
import { createHeaderCollapser } from '../utils/createHeaderCollapser';
import { SplitDrawerGroup } from './SplitDrawerContext';
import { SplitHeader, SplitMoreMenuButton } from './SplitHeader';
import { SplitToolbar } from './SplitToolbar';

type SplitPanelProps = {
  setPanelRef: (ref: HTMLDivElement) => void;
  handle: SplitHandle;
  split: SplitState;
  active: boolean;
  index: number;
};

export function SplitPanel(props: SplitPanelProps) {
  const [attachHotKeys, splitHotkeyScope] = useHotkeyDOMScope(
    `split=${props.split.id}`
  );
  const [panelRef, setPanelRef] = createSignal<HTMLDivElement | null>(null);
  const [contentOffsetTop, setContentOffsetTop] = createSignal(0);
  const [previewState, setPreviewState] = createSignal(false);
  const panelSize = createElementSize(panelRef);

  const layoutRefs: SplitPanelContextType['layoutRefs'] = {};
  const headerCollapser = createHeaderCollapser(
    () => layoutRefs.headerLeft,
    () => panelSize.width
  );

  const splitLayoutHelpers = useSplitLayout();

  registerSplitHotkeys({
    goHome: () =>
      props.handle.replace({
        next: { type: 'component', id: LIST_VIEW_ID.inbox },
        referredFrom: 'hotkey',
      }),
    isNotUnifiedList: () => {
      const content = props.handle.content();
      return !isListViewID(content.id);
    },
    getSplitCount: () => splitLayoutHelpers.getSplitCount(),
    toggleSpotlight: () => props.handle.toggleSpotlight(),
    canGoForward: () => props.handle.canGoForward(),
    insertSplit: splitLayoutHelpers.insertSplit,
    splitName: () => props.handle.displayName(),
    canGoBack: () => props.handle.canGoBack(),
    goForward: () => props.handle.goForward(),
    closeSplit: () => props.handle.close(),
    goBack: () => props.handle.goBack(),
    splitHotkeyScope,
  });

  const nextSoup = createSoupState({
    initialPredicates: { and: ['explicit-noise'] },
  });

  createEffect(
    on([panelRef], () => {
      if (isMobile()) return;
      panelRef()?.focus();
    })
  );

  const [toolbarRef, setToolbarRef] = createSignal<HTMLDivElement | null>(null);
  const [headerRef, setHeaderRef] = createSignal<HTMLDivElement | null>(null);
  const toolbarSize = createElementSize(toolbarRef);
  const headerSize = createElementSize(headerRef);


  const offsetTop = createMemo(() => {
    const offset = (headerSize.height ?? 0) + (toolbarSize.height ?? 0);
    setContentOffsetTop(offset);
    return offset;
  });

  const shouldHideSplitHeader = createMemo(
    () => isMobile() && isListViewID(props.handle.content().id)
  );

  return (
    <SoupContextProvider soup={nextSoup}>
      <SplitPanelContext.Provider
        value={{
          previewState: [previewState, setPreviewState],
          isPanelActive: () => props.active,
          handle: props.handle,
          setContentOffsetTop,
          contentOffsetTop,
          splitHotkeyScope,
          headerCollapser,
          layoutRefs,
          panelSize,
          panelRef,
        }}
      >
        <SplitDrawerGroup contentOffsetTop={offsetTop} panelSize={panelSize}>
            <Show when={props.handle.isSpotLight()}>
              <div
                class="fixed inset-0 w-screen h-screen z-modal-overlay bg-modal-overlay pattern-diagonal-4 pattern-edge-muted"
                onClick={() => props.handle.toggleSpotlight(false)}
              />
            </Show>

            <div
              class={cn(
                props.handle.isSpotLight()
                  ? 'group fixed inset-16 z-modal-content isolate'
                  : 'group relative size-full'
              )}
              ref={(ref) => {
                setPanelRef(ref);
                props.setPanelRef(ref);
                attachHotKeys(ref);
              }}
              data-split-id={props.split.id}
              {...splitContainerAttribute}
              data-modal={props.handle.isSpotLight()}
              tabindex={-1}
            >
              <div class="absolute -right-2 -top-2 z-70 opacity-0 transition-opacity hover:opacity-100 group-has-[[data-split-header]:hover]:opacity-100 group-has-[[data-split-more-menu][data-expanded]]:opacity-100">
                <SplitMoreMenuButton />
              </div>
              <Panel
                class="rounded-xl mobile:rounded-none mobile:after:hidden"
                depth={1}
                style={{
                  'background-image': 'linear-gradient(var(--b0), var(--b0))',
                  border: '0',
                }}
              >
                <div
                  class="split-panel-shadow pointer-events-none absolute inset-0 z-60 rounded-[inherit] mobile:hidden"
                  style={{
                    'box-shadow': props.active
                      ? 'inset 0 0 0 1px var(--color-edge-muted), inset 0 2px 0 0 var(--split-panel-active-top-shadow), inset 0 -2px 0 0 var(--split-panel-bottom-shadow), 0 10px 28px -18px var(--split-panel-drop-shadow-strong), 0 2px 8px -6px var(--split-panel-drop-shadow-soft)'
                      : 'inset 0 0 0 1px var(--color-edge-muted), inset 0 -2px 0 0 var(--split-panel-bottom-shadow), 0 10px 28px -18px var(--split-panel-drop-shadow-strong), 0 2px 8px -6px var(--split-panel-drop-shadow-soft)',
                  }}
                />
                <Panel.Header
                  class={cn(
                    'block h-10 min-h-10 touch:min-h-10 p-0 overflow-visible border-b-0',
                    shouldHideSplitHeader() && 'hidden'
                  )}
                >
                  <SplitHeader ref={setHeaderRef} />
                </Panel.Header>

                <Panel.Toolbar class="items-start py-0 overflow-visible border-b-0 not-has-[[data-split-portal-target]:not(:empty)]:hidden has-[[data-split-portal-target]:not(:empty)]:py-2">
                  <SplitToolbar ref={setToolbarRef} />
                </Panel.Toolbar>

                <Panel.Body>
                  <div class="@container/split size-full overflow-hidden relative">
                    <Suspense>
                      <SoupViewContextProvider soup={nextSoup}>
                        <Dynamic component={props.split.mount.element} />
                      </SoupViewContextProvider>
                    </Suspense>
                  </div>
                </Panel.Body>
              </Panel>
            </div>
          </SplitDrawerGroup>
      </SplitPanelContext.Provider>
    </SoupContextProvider>
  );
}
