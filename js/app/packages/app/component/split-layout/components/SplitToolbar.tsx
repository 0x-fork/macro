import {
  createEffect,
  createSignal,
  type ParentProps,
  Show,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { useSplitPanelOrThrow } from '../layoutUtils';

export function SplitToolbarLeft(
  props: ParentProps<{
    class?: string;
  }>
) {
  const panel = useSplitPanelOrThrow();
  const [portalRef, setPortalRef] = createSignal<HTMLDivElement | null>(null);

  createEffect(() => {
    const ref = portalRef();
    if (!ref) return;
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

  createEffect(() => {
    const ref = portalRef();
    if (!ref) return;
    ref.style.order = props.order?.toString() ?? '0';
  });

  return (
    <Show when={panel.layoutRefs.toolbarRight}>
      <Portal ref={setPortalRef} mount={panel.layoutRefs.toolbarRight}>
        {props.children}
      </Portal>
    </Show>
  );
}
