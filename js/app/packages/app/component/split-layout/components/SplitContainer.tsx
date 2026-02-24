import MacroJump from '@app/component/MacroJump';
import { MobileDock } from '@app/component/mobile/MobileDock';
import { createElementSize } from '@solid-primitives/resize-observer';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  on,
  type ParentProps,
  type Setter,
  Show,
} from 'solid-js';
import { useSplitPanelOrThrow } from '../layoutUtils';
import { SplitDrawerGroup } from './SplitDrawerContext';
import { SplitHeader } from './SplitHeader';
import { SplitModalProvider } from './SplitModalContext';
import { SplitToolbar } from './SplitToolbar';
import { virtualKeyboardVisible } from '@core/mobile/virtualKeyboard';
import { ClippedPanel } from '@core/component/ClippedPanel';
import { globalSplitManager } from '@app/signal/splitLayout';
import { isMobile } from '@core/mobile/isMobile';
import CaretRight from '@icon/regular/caret-right.svg';
import { GlobalSidebar } from '@app/component/global-sidebar/GlobalSidebar';
import { SoupToolbar } from '@app/component/next-soup/soup-view/soup-toolbar';

export function SplitContainer(
  props: ParentProps<{
    ref: (elem: HTMLDivElement) => void;
    active?: boolean;
    tl?: boolean;
    tr?: boolean;
    br?: boolean;
    bl?: boolean;
    id: string;
  }>
) {
  const panel = useSplitPanelOrThrow();
  if (!panel) {
    throw new Error('<SplitContainer /> must be used within a <SplitLayout />');
  }

  const [ref, setRef] = createSignal<HTMLDivElement>();
  createEffect(
    on([ref], () => {
      ref()?.focus();
    })
  );

  const [toolbarRef, setToolbarRef] = createSignal<HTMLDivElement | null>(null);
  const [headerRef, setHeaderRef] = createSignal<HTMLDivElement | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = createSignal(false);

  const headerSize = createElementSize(headerRef);
  const toolbarSize = createElementSize(toolbarRef);
  const offsetTop = createMemo(() => {
    const offset = (headerSize.height ?? 0) + (toolbarSize.height ?? 0);
    panel.setContentOffsetTop(offset);
    return offset;
  });

  function multipleSplits() {
    const splits = globalSplitManager()?.splits?.();
    return Boolean(splits && splits.length > 1);
  }

  return (
    <SplitModalProvider>
      <SplitDrawerGroup
        contentOffsetTop={offsetTop}
        panelSize={panel.panelSize}
      >
        <Show when={panel.handle.isSpotLight()}>
          <div
            class="fixed inset-0 w-screen h-screen z-modal-overlay bg-modal-overlay pattern-diagonal-4 pattern-edge-muted"
            onClick={() => panel.handle.toggleSpotlight(false)}
          />
          <div class="fixed inset-[4rem] bg-panel shadow-xl" />
        </Show>

        <div
          classList={{
            'fixed inset-[4rem] z-modal-overlay isolate opacity-50':
              panel.handle.isSpotLight(),
            'opacity-100':
              panel.handle.isActive() || panel.handle.isSpotLight(),
            'size-full': !panel.handle.isSpotLight(),
            'opacity-85': !panel.handle.isActive(),
          }}
          ref={(ref) => {
            setRef(ref);
            props.ref(ref);
          }}
          data-split-id={props.id}
          class="bracket-never"
          data-split-container
          data-modal={panel.handle.isSpotLight()}
          tabindex={-1}
        >
          <ClippedPanel
            active={
              panel.handle.isActive() &&
              multipleSplits() &&
              !panel.handle.isSpotLight()
            }
            edgeColor="transparent"
          >
            <div class="@container/split size-full overflow-hidden flex min-w-0 bg-panel">
              <Show when={!isSidebarCollapsed()}>
                <div class="w-[260px] shrink-0 min-h-0">
                  <GlobalSidebar
                    splitHandle={panel.handle}
                    onCollapse={() => setIsSidebarCollapsed(true)}
                  />
                </div>
              </Show>
              <div class="flex-1 min-w-0 min-h-0 relative flex flex-col">
                <SplitHeader ref={setHeaderRef} />
                <SoupToolbar />
                <SplitToolbar ref={setToolbarRef} />
                <div class="size-full min-h-0 overflow-hidden relative">
                  <Show when={isSidebarCollapsed()}>
                    <button
                      type="button"
                      class="absolute top-2 left-2 z-10 size-6 rounded-md grid place-items-center text-ink-muted bg-panel border border-edge-muted/50 hover:bg-hover/40"
                      onClick={() => setIsSidebarCollapsed(false)}
                      aria-label="Expand sidebar"
                    >
                      <CaretRight class="size-4" />
                    </button>
                  </Show>
                  {props.children}
                </div>
              </div>
              <Show when={panel.handle.isSpotLight()}>
                <MacroJump tabbableParent={ref} />
              </Show>
              <Show when={isMobile() && !virtualKeyboardVisible()}>
                <MobileDock />
              </Show>
            </div>
          </ClippedPanel>
        </div>
      </SplitDrawerGroup>
    </SplitModalProvider>
  );
}

export function SplitlikeContainer(
  props: ParentProps<{
    setSpotlight: Setter<boolean>;
    spotlight: Accessor<boolean>;
    active?: boolean;
    tl?: boolean;
    tr?: boolean;
    br?: boolean;
    bl?: boolean;
  }>
) {
  const [panel, setPanel] = createSignal<HTMLDivElement | null>(null);
  const panelSize = createElementSize(panel);

  return (
    <SplitModalProvider>
      <SplitDrawerGroup panelSize={panelSize} contentOffsetTop={() => 0}>
        <Show when={props.spotlight()}>
          <MacroJump tabbableParent={() => panel() ?? undefined} />
          <div
            class="fixed inset-0 w-screen h-screen z-modal-overlay bg-modal-overlay pattern-diagonal-4 pattern-edge-muted"
            onClick={() => props.setSpotlight(false)}
          />
          <div class="fixed inset-[4rem] bg-panel shadow-xl" />
        </Show>

        <div
          class="@container/split flex flex-col min-h-0 bracket-never bg-panel"
          classList={{
            'fixed inset-[4rem] z-modal isolate': props.spotlight(),
            'size-full': !props.spotlight(),
          }}
          data-split-container
          tabindex={-1}
          ref={setPanel}
        >
          <div class="size-full">{props.children}</div>
        </div>
      </SplitDrawerGroup>
    </SplitModalProvider>
  );
}
