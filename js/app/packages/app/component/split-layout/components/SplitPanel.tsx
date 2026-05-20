import { createSoupState } from '@app/component/next-soup/create-soup-state';
import { SoupContextProvider } from '@app/component/next-soup/soup-context';
import { isListViewID, LIST_VIEW_ID } from '@app/constants/list-views';
import { globalSplitManager } from '@app/signal/splitLayout';
import { Resize, ResizeZoneContext } from '@core/component/Resize';
import { splitContainerAttribute } from '@core/dom-selectors';
import { isMobile } from '@core/mobile/isMobile';
import { createElementSize } from '@solid-primitives/resize-observer';
import { cn, Panel } from '@ui';
import { useHotkeyDOMScope } from 'core/hotkey/hotkeys';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  on,
  onCleanup,
  onMount,
  Show,
  Suspense,
  useContext,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { SplitPanelContext, type SplitPanelContextType } from '../context';
import { useSplitLayout } from '../layout';
import type { SplitHandle, SplitState } from '../layoutManager';
import { registerSplitHotkeys } from '../registerSplitHotkeys';
import { createHeaderCollapser } from '../utils/createHeaderCollapser';
import { SplitDrawerGroup } from './SplitDrawerContext';
import { SplitHeader } from './SplitHeader';
import { SplitToolbar } from './SplitToolbar';

type SplitPanelProps = {
  setPanelRef: (ref: HTMLDivElement) => void;
  handle: SplitHandle;
  split: SplitState;
  active: boolean;
  index: number;
};

/**
 * Reads the live computed width of a Resize.Panel (identified by `id`) from
 * the surrounding <Resize.Zone> and pushes it into the provided setter.
 * Renders nothing; placed inside <Resize.Zone> purely for its reactive effect.
 *
 * Used so that <Panel.Toolbar> -- which lives OUTSIDE <Resize.Zone> -- can mirror
 * the body split's widths and keep its dividing line aligned with the gutter.
 */
function ResizePanelWidthSync(props: {
  id: string;
  setWidth: (w: number) => void;
}) {
  const ctx = useContext(ResizeZoneContext);
  if (!ctx) return null;
  const size = createMemo(ctx.sizeOf(props.id));
  createEffect(() => props.setWidth(size()));
  return null;
}

export function SplitPanel(props: SplitPanelProps) {
  const [attachHotKeys, splitHotkeyScope] = useHotkeyDOMScope(
    `split=${props.split.id}`
  );
  const [panelRef, setPanelRef] = createSignal<HTMLDivElement | null>(null);
  const [contentOffsetTop, setContentOffsetTop] = createSignal(0);
  const [previewState, setPreviewState] = createSignal(false);
  const [previewContent, setPreviewContent] = createSignal<
    (() => JSX.Element) | undefined
  >(undefined);
  const panelSize = createElementSize(panelRef);

  // Width of the main body Resize.Panel. Used to size the matching toolbar
  // section so the toolbar divider lines up with the body's resize gutter.
  const [mainBodyWidth, setMainBodyWidth] = createSignal(0);

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

  const [hasToolbarContent, setHasToolbarContent] = createSignal(false);
  onMount(() => {
    const checkContent = () => {
      setHasToolbarContent(
        Boolean(
          layoutRefs.toolbarLeft?.hasChildNodes() ||
            layoutRefs.toolbarRight?.hasChildNodes() ||
            layoutRefs.previewToolbarLeft?.hasChildNodes() ||
            layoutRefs.previewToolbarRight?.hasChildNodes()
        )
      );
    };
    checkContent();
    const observer = new MutationObserver(checkContent);
    const observe = (el: HTMLElement | undefined) =>
      el && observer.observe(el, { childList: true });
    observe(layoutRefs.toolbarLeft);
    observe(layoutRefs.toolbarRight);
    // previewToolbar* are mounted lazily with the preview Resize.Panel; the
    // ref callbacks below also re-attach the observer when they appear.
    onCleanup(() => observer.disconnect());

    // Re-observe whenever the preview slots come/go.
    createEffect(() => {
      if (!previewState()) return;
      observe(layoutRefs.previewToolbarLeft);
      observe(layoutRefs.previewToolbarRight);
      checkContent();
    });
  });

  const offsetTop = createMemo(() => {
    const offset = (headerSize.height ?? 0) + (toolbarSize.height ?? 0);
    setContentOffsetTop(offset);
    return offset;
  });

  function multipleSplits() {
    const splits = globalSplitManager()?.splits?.();
    return Boolean(splits && splits.length > 1);
  }

  const shouldHideSplitHeader = createMemo(
    () => isMobile() && isListViewID(props.handle.content().id)
  );

  // Width style for the main toolbar section so it matches the main body's
  // Resize.Panel width when preview is open. When preview is closed, the
  // section just takes the full row (flex-1).
  const mainToolbarSectionStyle: Accessor<JSX.CSSProperties> = () =>
    previewState()
      ? { width: `${mainBodyWidth()}px`, 'flex-shrink': 0, 'flex-grow': 0 }
      : { flex: 1 };

  return (
    <SoupContextProvider soup={nextSoup}>
      <SplitPanelContext.Provider
        value={{
          previewState: [previewState, setPreviewState],
          previewContent: [previewContent, setPreviewContent],
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
            <div class="fixed inset-16 bg-surface shadow-xl" />
          </Show>

          <div
            classList={{
              'fixed inset-16 z-modal-overlay isolate opacity-50':
                props.handle.isSpotLight(),
              'opacity-100': props.active || props.handle.isSpotLight(),
              'size-full': !props.handle.isSpotLight(),
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
              active={
                !isMobile() &&
                props.active &&
                multipleSplits() &&
                !props.handle.isSpotLight()
              }
              class="rounded-xl mobile:rounded-none mobile:after:hidden mobile:!border-0"
              depth={1}
            >
              <Panel.Header
                data-split-header
                class={cn(
                  'block min-h-10.25 touch:min-h-11.25 p-0 overflow-visible',
                  shouldHideSplitHeader() && 'hidden'
                )}
              >
                <SplitHeader ref={setHeaderRef} />
              </Panel.Header>

              <Panel.Toolbar
                class={cn(
                  // zero out Panel.Toolbar's own px-2 + overflow clipping so
                  // the two sections can claim exact widths matching the body
                  // Resize.Panels below.
                  'px-0 items-start py-2 overflow-visible',
                  !hasToolbarContent() && 'hidden',
                  !previewState() && 'border-b-0'
                )}
              >
                <div ref={setToolbarRef} class="flex w-full overflow-visible">
                  <div
                    class={cn(
                      'flex items-start px-2 min-w-0 overflow-visible',
                      // Vertical divider that lines up with the body's
                      // <Resize.Panel> border-r when preview is open.
                      previewState() && 'border-r border-edge-muted'
                    )}
                    style={mainToolbarSectionStyle()}
                  >
                    <SplitToolbar />
                  </div>
                  <Show when={previewState()}>
                    <div class="flex-1 flex items-start justify-between px-2 min-w-0 overflow-visible">
                      <div
                        class="flex-1 flex items-start gap-1 min-w-0"
                        ref={(ref) => {
                          layoutRefs.previewToolbarLeft = ref;
                          onCleanup(() => {
                            if (layoutRefs.previewToolbarLeft === ref) {
                              layoutRefs.previewToolbarLeft = undefined;
                            }
                          });
                        }}
                      />
                      <div
                        class="flex items-start gap-1"
                        ref={(ref) => {
                          layoutRefs.previewToolbarRight = ref;
                          onCleanup(() => {
                            if (layoutRefs.previewToolbarRight === ref) {
                              layoutRefs.previewToolbarRight = undefined;
                            }
                          });
                        }}
                      />
                    </div>
                  </Show>
                </div>
              </Panel.Toolbar>

              <Panel.Body>
                <Resize.Zone direction="horizontal" gutter={0}>
                  <ResizePanelWidthSync
                    id="split-main"
                    setWidth={setMainBodyWidth}
                  />
                  <Resize.Panel
                    id="split-main"
                    minSize={200}
                    maxSize={previewState() ? 840 : undefined}
                  >
                    <div
                      class={cn(
                        'size-full overflow-hidden relative',
                        previewState() && 'border-r border-edge-muted'
                      )}
                    >
                      <div class="@container/split size-full overflow-hidden relative">
                        <Suspense>
                          <Dynamic component={props.split.mount.element} />
                        </Suspense>
                      </div>
                    </div>
                  </Resize.Panel>
                  <Show when={previewState()}>
                    <Resize.Panel
                      id="split-preview"
                      minSize={300}
                      target={{ kind: 'percent', percent: 70 }}
                    >
                      <div class="size-full overflow-hidden relative">
                        <Show when={previewContent()}>
                          {(content) => content()()}
                        </Show>
                      </div>
                    </Resize.Panel>
                  </Show>
                </Resize.Zone>
              </Panel.Body>
            </Panel>
          </div>
        </SplitDrawerGroup>
      </SplitPanelContext.Provider>
    </SoupContextProvider>
  );
}
