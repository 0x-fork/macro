import {
  createRenderEffect,
  createSignal,
  onCleanup,
  onMount,
  type ParentProps,
  type Setter,
  Show,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { useSplitPanelOrThrow } from '../layoutUtils';

export function SplitToolbar(props: { ref: Setter<HTMLDivElement | null> }) {
  const panel = useSplitPanelOrThrow();
  const [hasContent, setHasContent] = createSignal(false);

  const checkContent = () => {
    const leftHasContent =
      panel.layoutRefs.toolbarLeft?.hasChildNodes() || false;
    const rightHasContent =
      panel.layoutRefs.toolbarRight?.hasChildNodes() || false;
    setHasContent(leftHasContent || rightHasContent);
  };

  onMount(() => {
    checkContent();
    const observer = new MutationObserver(checkContent);

    if (panel.layoutRefs.toolbarLeft) {
      observer.observe(panel.layoutRefs.toolbarLeft, { childList: true });
    }

    if (panel.layoutRefs.toolbarRight) {
      observer.observe(panel.layoutRefs.toolbarRight, { childList: true });
    }

    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      class="relative w-full flex items-center justify-between shrink-0"
      classList={{
        'h-10 px-1 border-b border-edge-muted/50': hasContent(),
      }}
      data-split-toolbar
      ref={props.ref}
    >
      <div
        class="flex h-full items-center flex-1 gap-1.5 px-2"
        ref={(ref) => {
          panel.layoutRefs.toolbarLeft = ref;
        }}
      />
      <div
        class="flex h-full items-center"
        ref={(ref) => {
          panel.layoutRefs.toolbarRight = ref;
        }}
      />
    </div>
  );
}

export function SplitToolbarLeft(
  props: ParentProps<{
    class?: string;
  }>
) {
  const panel = useSplitPanelOrThrow();
  const [portalRef, setPortalRef] = createSignal<HTMLDivElement | null>(null);

  const halfWidthClasses = () =>
    'absolute h-full left-[30%] top-0 flex items-center'.split(' ');

  createRenderEffect(() => {
    const ref = portalRef();
    if (!ref) return;
    const halfSplitState = panel.halfSplitState?.();
    if (halfSplitState?.side === 'right') {
      ref.classList.add(...halfWidthClasses());
      // In half-split mode we need this portal to span the toolbar region.
      ref.style.width = '100%';
      ref.style.display = 'flex';
    } else {
      ref.classList.remove(...halfWidthClasses());
      // Allow multiple SplitToolbarLeft portals to flow inline without forcing
      // a full-width flex item (which creates large gaps).
      ref.style.width = 'auto';
      // Make the portal wrapper transparent to layout so all inserts share one flex row.
      ref.style.display = 'contents';
    }
    if (props.class) {
      ref.classList.add(props.class);
    }
  });

  return (
    <Show when={panel.layoutRefs.toolbarLeft}>
      <Portal ref={setPortalRef} mount={panel.layoutRefs.toolbarLeft}>
        {props.children}
      </Portal>
    </Show>
  );
}

export function SplitToolbarRight(props: ParentProps<{ order?: number }>) {
  const panel = useSplitPanelOrThrow();
  const [portalRef, setPortalRef] = createSignal<HTMLDivElement | null>(null);

  const halfWidthClasses = () =>
    'absolute h-full right-[70%] top-0 flex items-center'.split(' ');

  createRenderEffect(() => {
    const ref = portalRef();
    if (!ref) return;
    ref.style.order = props.order?.toString() ?? '0';
    const halfSplitState = panel.halfSplitState?.();
    if (halfSplitState?.side === 'left') {
      ref.classList.add(...halfWidthClasses());
    } else {
      ref.classList.remove(...halfWidthClasses());
    }
  });
  return (
    <Show when={panel.layoutRefs.toolbarRight}>
      <Portal ref={setPortalRef} mount={panel.layoutRefs.toolbarRight}>
        {props.children}
      </Portal>
    </Show>
  );
}
