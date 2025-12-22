import EntityNavigationIndicator from '@app/component/EntityNavigationIndicator';
import { IconButton } from '@core/component/IconButton';
import { TOKENS } from '@core/hotkey/tokens';
import CollapseIcon from '@icon/regular/arrows-in.svg';
import ExpandIcon from '@icon/regular/arrows-out.svg';
import CaretLeft from '@icon/regular/caret-left.svg';
import CaretRight from '@icon/regular/caret-right.svg';
import CloseIcon from '@icon/regular/x.svg';
import {
  createEffect,
  createSignal,
  type ParentProps,
  type Setter,
  Show,
  useContext,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { SplitLayoutContext, SplitPanelContext } from '../context';
import { canSpotlight } from '../utils/canSpotlight';

function SplitBackButton() {
  const context = useContext(SplitPanelContext);
  if (!context) return null;
  return (
    <IconButton
      size="sm"
      icon={CaretLeft}
      tooltip={{ label: 'Go Back', hotkeyToken: TOKENS.split.go.back }}
      disabled={!context.handle.canGoBack()}
      theme="current"
      onClick={context.handle.goBack}
    />
  );
}

function SplitForwardButton() {
  const context = useContext(SplitPanelContext);
  if (!context) return '';
  return (
    <IconButton
      size="sm"
      icon={CaretRight}
      tooltip={{ label: 'Go Forward', hotkeyToken: TOKENS.split.go.forward }}
      disabled={!context.handle.canGoForward()}
      theme="current"
      onClick={context.handle.goForward}
    />
  );
}

function SplitSpotlightButton() {
  const context = useContext(SplitPanelContext);
  const layout = useContext(SplitLayoutContext);
  if (!context || !layout) return '';
  return (
    <Show when={canSpotlight(layout.manager)}>
      <IconButton
        size="sm"
        icon={context.handle.isSpotLight() ? CollapseIcon : ExpandIcon}
        theme="current"
        tooltip={{
          hotkeyToken: TOKENS.window.spotlight.toggle,
          label: context.handle.isSpotLight()
            ? 'Minimize Split'
            : 'Spotlight Split',
        }}
        onClick={() => context.handle.toggleSpotlight()}
      />
    </Show>
  );
}

function SplitCloseButton() {
  const context = useContext(SplitPanelContext);
  if (!context) return null;
  return (
    <IconButton
      size="sm"
      iconSize={16}
      icon={CloseIcon}
      theme="current"
      tooltip={{ label: 'Close', hotkeyToken: TOKENS.window.close }}
      onClick={context.handle.close}
    />
  );
}

function SplitControlButtons() {
  return (
    <div class="flex flex-row items-center px-2 h-full shrink-0">
      <div class="ios:hidden">
        <SplitCloseButton />
      </div>
      <SplitBackButton />
      <SplitForwardButton />
    </div>
  );
}

export function SplitHeader(props: { ref: Setter<HTMLDivElement | null> }) {
  const ctx = useContext(SplitPanelContext);
  if (!ctx)
    throw new Error('<SplitHeader> must be used within a <SplitLayout>');

  return (
    <div
      class="isolate relative w-full h-10 overflow-clip text-ink shrink-0"
      data-split-header
      ref={props.ref}
    >
      <div class="absolute inset-0 flex justify-start items-center bg-panel border-b border-b-edge-muted">
        <SplitControlButtons />
        <div
          class="relative flex items-center gap-1.5 pl-1 pr-2 min-w-0 h-full flex-1"
          ref={(ref) => {
            ctx.layoutRefs.headerLeft = ref;
          }}
        />

        <div
          class="min-w-4 h-full shrink-0 ios:hidden"
          ref={(ref) => {
            ctx.layoutRefs.headerRight = ref;
          }}
        />
        <div class="z-2 relative flex items-center bg-panel pr-2 h-full ios:hidden">
          <EntityNavigationIndicator />
          <SplitSpotlightButton />
        </div>
      </div>
    </div>
  );
}

export function SplitHeaderLeft(props: ParentProps<{ order?: number }>) {
  const ctx = useContext(SplitPanelContext);
  if (!ctx)
    throw new Error('<SplitHeaderLeft> must be used within a <SplitLayout>');
  const [portalRef, setPortalRef] = createSignal<HTMLDivElement | null>(null);
  createEffect(() => {
    const ref = portalRef();
    if (!ref) return;
    ref.style.order = props.order?.toString() ?? '0';
  });
  return (
    <Show when={ctx.layoutRefs.headerLeft}>
      <Portal
        mount={ctx.layoutRefs.headerLeft}
        ref={(div) => {
          setPortalRef(div);
          div.style.display = 'contents';
        }}
      >
        {props.children}
      </Portal>
    </Show>
  );
}

export function SplitHeaderRight(props: ParentProps<{ order?: number }>) {
  const ctx = useContext(SplitPanelContext);
  if (!ctx)
    throw new Error('<SplitHeaderRight> must be used within a <SplitLayout>');
  const [portalRef, setPortalRef] = createSignal<HTMLDivElement | null>(null);
  createEffect(() => {
    const ref = portalRef();
    if (!ref) return;
    ref.style.order = props.order?.toString() ?? '0';
  });
  return (
    <Show when={ctx.layoutRefs.headerRight}>
      <Portal
        mount={ctx.layoutRefs.headerRight}
        ref={(div) => {
          setPortalRef(div);
          div.style.display = 'contents';
        }}
      >
        {props.children}
      </Portal>
    </Show>
  );
}
