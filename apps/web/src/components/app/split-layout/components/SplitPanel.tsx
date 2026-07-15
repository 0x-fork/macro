import { isListViewID, LIST_VIEW_ID } from '@app/constants/list-views';
import { createSoupState } from '@app/features/next-soup/create-soup-state';
import { SoupContextProvider } from '@app/features/next-soup/soup-context';
import { SoupViewContextProvider } from '@app/features/next-soup/soup-view/soup-view-context';
import { globalSplitManager } from '@app/signal/splitLayout';
import { isSoloSettings } from '@core/constant/SettingsState';
import { splitContainerAttribute } from '@core/dom-selectors';
import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { isMobile } from '@core/mobile/isMobile';
import { getSafeAreaInset } from '@core/mobile/safeAreaInsets';
import { createElementSize } from '@solid-primitives/resize-observer';
import { cn, Panel } from '@ui';
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  Show,
  Suspense,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  type SplitBottomPanelRegistration,
  type SplitFileMenuActionGroups,
  type SplitLayoutRefs,
  SplitPanelContext,
  type SplitPanelContextType,
} from '../context';
import { useSplitLayout } from '../layout';
import type { SplitHandle, SplitState } from '../layoutManager';
import { registerSplitHotkeys } from '../registerSplitHotkeys';
import { createHeaderCollapser } from '../utils/createHeaderCollapser';
import { SplitDrawerGroup } from './SplitDrawerContext';

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
  const [titleFileMenuRef, setTitleFileMenuRef] =
    createSignal<HTMLDivElement>();
  const [titleFileMenuTrigger, setTitleFileMenuTrigger] =
    createSignal<() => void>();
  const [titleFileMenuActions, setTitleFileMenuActions] =
    createSignal<SplitFileMenuActionGroups>();
  const [bottomPanel, setBottomPanel] =
    createSignal<SplitBottomPanelRegistration>();
  const panelSize = createElementSize(panelRef);

  const layoutRefs: SplitPanelContextType['layoutRefs'] = {};
  const [headerLeftTarget, setHeaderLeftTarget] =
    createSignal<HTMLDivElement>();
  const [toolbarLeftTarget, setToolbarLeftTarget] =
    createSignal<HTMLDivElement>();
  const [toolbarRightTarget, setToolbarRightTarget] =
    createSignal<HTMLDivElement>();

  const setLayoutRef = (slot: keyof SplitLayoutRefs, ref: HTMLDivElement) => {
    layoutRefs[slot] = ref;
    if (slot === 'headerLeft') setHeaderLeftTarget(ref);
    if (slot === 'toolbarLeft') setToolbarLeftTarget(ref);
    if (slot === 'toolbarRight') setToolbarRightTarget(ref);
  };

  const headerCollapser = createHeaderCollapser(
    headerLeftTarget,
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

  const [hasToolbarContent, setHasToolbarContent] = createSignal(false);
  createEffect(() => {
    const left = toolbarLeftTarget();
    const right = toolbarRightTarget();
    const checkContent = () => {
      setHasToolbarContent(
        Boolean(left?.hasChildNodes() || right?.hasChildNodes())
      );
    };

    checkContent();
    const observer = new MutationObserver(checkContent);
    if (left) observer.observe(left, { childList: true });
    if (right) observer.observe(right, { childList: true });
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    const safeTop = isMobile() ? getSafeAreaInset('top') : 0;
    const offset =
      safeTop + (headerSize.height ?? 0) + (toolbarSize.height ?? 0);
    setContentOffsetTop(offset);
  });

  function multipleSplits() {
    const splits = globalSplitManager()?.splits?.();
    return Boolean(splits && splits.length > 1);
  }

  const shouldHideSplitHeader = createMemo(
    () =>
      (isMobile() && isListViewID(props.handle.content().id)) ||
      isSoloSettings()
  );

  const splitFocusStyling = () =>
    !isMobile() &&
    props.active &&
    multipleSplits() &&
    !props.handle.isSpotLight();

  const splitUnfocusedStyling = () =>
    !isMobile() && !props.active && multipleSplits();

  return (
    <SoupContextProvider soup={nextSoup}>
      <SplitPanelContext.Provider
        value={{
          previewState: [previewState, setPreviewState],
          isPanelActive: () => props.active,
          handle: props.handle,
          setContentOffsetTop,
          contentOffsetTop,
          setHeaderRef,
          setToolbarRef,
          hasToolbarContent,
          shouldHideSplitHeader,
          splitHotkeyScope,
          bottomPanel,
          registerBottomPanel: (panel) => {
            setBottomPanel(panel);
            return () => {
              setBottomPanel((current) =>
                current?.id === panel.id ? undefined : current
              );
            };
          },
          headerCollapser,
          layoutRefs,
          setLayoutRef,
          titleFileMenuRef,
          setTitleFileMenuRef,
          titleFileMenuTrigger,
          setTitleFileMenuTrigger,
          titleFileMenuActions,
          setTitleFileMenuActions,
          panelSize,
          panelRef,
        }}
      >
        <SplitDrawerGroup panelSize={panelSize}>
          <Show when={props.handle.isSpotLight()}>
            <div
              class="fixed inset-0 w-screen h-screen z-modal-overlay bg-modal-overlay pattern-diagonal-4 pattern-edge-muted"
              onClick={() => props.handle.toggleSpotlight(false)}
            />
            <div class="fixed inset-16 bg-surface shadow-xl" />
          </Show>

          <div
            classList={{
              'fixed inset-16 z-modal-overlay isolate opacity-50':
                props.handle.isSpotLight(),
              'opacity-100': props.active || props.handle.isSpotLight(),
              'relative size-full': !props.handle.isSpotLight(),
            }}
            style={{
              '--split-header-height': `${
                shouldHideSplitHeader() ? 0 : (headerSize.height ?? 0)
              }px`,
              // The hard spacer for top-anchored content on full-frame
              // mobile: status bar + floating header strip.
              '--mobile-content-inset-top':
                'calc(var(--safe-top, 0px) + var(--split-header-height, 0px))',
            }}
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
            <Panel
              edgeColor={
                splitFocusStyling()
                  ? 'color-mix(in oklch, var(--color-edge) 80%, var(--color-ink))'
                  : undefined
              }
              class={cn(
                'relative rounded-xl mobile:rounded-none mobile:after:hidden mobile:border-0! bg-panel',
                {
                  'shadow-sm shadow-drop-shadow/50 bg-panel/80 dark-mode:bg-panel/30':
                    splitUnfocusedStyling(),
                  'shadow-2xl shadow-drop-shadow': splitFocusStyling(),
                }
              )}
              depth={isMobile() ? 0 : 1}
            >
              <Suspense>
                <SoupViewContextProvider soup={nextSoup}>
                  <Dynamic component={props.split.mount.element} />
                </SoupViewContextProvider>
              </Suspense>
            </Panel>
          </div>
        </SplitDrawerGroup>
      </SplitPanelContext.Provider>
    </SoupContextProvider>
  );
}
