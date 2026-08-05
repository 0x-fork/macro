import type { CreatableBlock } from '@app/features/command/types';
import { getIconConfig } from '@core/component/EntityIcon';
import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
} from '@floating-ui/dom';
import { cn, Hotkey, Surface } from '@ui';
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from 'solid-js';
import { Dynamic, Portal } from 'solid-js/web';
import { CREATE_MENU_EXPLAINERS } from './create-menu-explainers';

/** Gap between the hovered row and the explainer panel. */
const ANCHOR_GAP_PX = 14;
/** Keeps the panel clear of the viewport edges when it has to shift or flip. */
const VIEWPORT_PADDING_PX = 12;

/**
 * The secondary panel that opens beside the create menu, explaining whichever
 * item is currently hovered or keyboard-focused.
 *
 * It is not a Kobalte submenu: sub-triggers can't also be selectable items, and
 * every row here has to stay clickable. Instead it's a portaled, pointer-inert
 * panel anchored to the active row — so it can't intercept clicks or trip the
 * menu's outside-interaction dismissal, and it follows keyboard navigation as
 * well as the pointer.
 */
export function CreateMenuExplainer(props: {
  /** The row the panel points at — undefined when nothing is active. */
  anchor: HTMLElement | undefined;
  /** The block that row creates. */
  block: CreatableBlock | undefined;
}) {
  const [panel, setPanel] = createSignal<HTMLElement>();
  // Floating UI resolves asynchronously, so hold the panel transparent until it
  // has a real position — otherwise it flashes in the viewport's top-left.
  // Tracked as the element that was placed, not a boolean, so a freshly
  // mounted panel doesn't inherit the previous one's "already placed" state.
  const [placedPanel, setPlacedPanel] = createSignal<HTMLElement>();
  const placed = () => panel() !== undefined && placedPanel() === panel();

  const explainer = createMemo(() => {
    const token = props.block?.hotkeyToken;
    return token ? CREATE_MENU_EXPLAINERS[token] : undefined;
  });

  createEffect(() => {
    const anchor = props.anchor;
    const el = panel();
    if (!anchor || !el) return;

    onCleanup(
      autoUpdate(anchor, el, () => {
        void computePosition(anchor, el, {
          strategy: 'fixed',
          placement: 'right-start',
          middleware: [
            offset(ANCHOR_GAP_PX),
            flip({ fallbackPlacements: ['left-start'] }),
            shift({ padding: VIEWPORT_PADDING_PX }),
          ],
        }).then(({ x, y }) => {
          el.style.translate = `${x}px ${y}px`;
          setPlacedPanel(el);
        });
      })
    );
  });

  return (
    <Show when={explainer()}>
      {(content) => (
        <Portal>
          <div
            ref={setPanel}
            aria-hidden="true"
            class="fixed top-0 left-0 z-action-menu w-72 max-w-[calc(100vw-24px)] pointer-events-none transition-opacity duration-100"
            style={{ opacity: placed() ? 1 : 0 }}
          >
            <Surface
              depth={3}
              class="flex flex-col gap-2 rounded-xl bg-menu p-3 shadow-menu"
            >
              <div class="flex items-center gap-2">
                <Show when={props.block}>
                  {(block) => (
                    <div
                      class={cn(
                        'size-4 shrink-0 flex items-center [&_svg]:size-4',
                        getIconConfig(block().blockName).foreground
                      )}
                    >
                      <Dynamic component={block().icon} />
                    </div>
                  )}
                </Show>
                <span class="text-[13px] font-medium text-ink">
                  {content().title}
                </span>
              </div>
              <p class="text-xs leading-relaxed text-ink-muted">
                {content().body}
              </p>
              <Show when={props.block?.altHotkeyToken}>
                {(token) => (
                  <div class="flex items-center gap-1.5 text-xxs text-ink-extra-muted">
                    <Hotkey token={token()} theme="subtle" class="flex gap-1" />
                    <span>Open in a new split</span>
                  </div>
                )}
              </Show>
            </Surface>
          </div>
        </Portal>
      )}
    </Show>
  );
}
