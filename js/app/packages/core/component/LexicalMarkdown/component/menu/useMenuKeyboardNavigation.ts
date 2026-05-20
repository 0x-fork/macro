import { onCleanup, onMount } from 'solid-js';
import { match } from 'ts-pattern';

export type MenuKeyboardHandlers = {
  /** Called when the user navigates up (ArrowUp, Ctrl+K, Ctrl+P, Shift+Tab) */
  onUp?: (e: KeyboardEvent) => void;

  /** Called when the user navigates down (ArrowDown, Ctrl+J, Ctrl+N, Tab) */
  onDown?: (e: KeyboardEvent) => void;

  /** Called when the user navigates left (ArrowLeft) */
  onLeft?: (e: KeyboardEvent) => void;

  /** Called when the user navigates right (ArrowRight) */
  onRight?: (e: KeyboardEvent) => void;

  /** Called when the user confirms selection (Enter) */
  onSelect?: (e: KeyboardEvent) => void;

  /** Called when the user cancels/closes (Escape) */
  onClose?: (e: KeyboardEvent) => void;

  /**
   * Called when the user presses Space.
   * Return `true` to preventDefault/stopPropagation, `false` to let it through.
   */
  onSpace?: (e: KeyboardEvent) => boolean;

  /** Called for any key that doesn't match a navigation handler. */
  onOtherKey?: (e: KeyboardEvent) => void;

  /**
   * Guard function - if returns false, no handlers are called.
   */
  isActive?: () => boolean;

  /**
   * Whether to use capture phase for the event listener.
   * @default true
   */
  capture?: boolean;

  /**
   * Whether to automatically call e.preventDefault() and e.stopPropagation()
   * when a handler is matched.
   * @default true
   */
  preventDefault?: boolean;
};

/**
 * Creates a keyboard handler that maps various key combinations to
 * directional navigation callbacks.
 *
 * Key mappings:
 * - Up: ArrowUp, Ctrl+K, Ctrl+P, Shift+Tab
 * - Down: ArrowDown, Ctrl+J, Ctrl+N, Tab (without Shift)
 * - Left: ArrowLeft
 * - Right: ArrowRight
 * - Select: Enter
 * - Close: Escape
 * - Space: Space
 *
 * @example
 * ```ts
 * const { handleKeyDown } = createMenuKeyboardNavigation({
 *   isActive: () => menuOpen(),
 *   onUp: () => setSelectedIndex(i => Math.max(0, i - 1)),
 *   onDown: () => setSelectedIndex(i => Math.min(items.length - 1, i + 1)),
 *   onSelect: () => selectCurrentItem(),
 *   onClose: () => setMenuOpen(false),
 *   onSpace: () => handleEscapeSpace(),
 *   onOtherKey: () => resetEscapeSpaceState(),
 * });
 * ```
 */
export function createMenuKeyboardNavigation(handlers: MenuKeyboardHandlers): {
  handleKeyDown: (e: KeyboardEvent) => void;
} {
  const {
    onUp,
    onDown,
    onLeft,
    onRight,
    onSelect,
    onClose,
    onSpace,
    onOtherKey,
    isActive,
    preventDefault = true,
  } = handlers;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isActive && !isActive()) return;

    const result = match(e.key)
      .with('ArrowUp', () => ({ kind: 'handler' as const, handler: onUp }))
      .with('ArrowDown', () => ({ kind: 'handler' as const, handler: onDown }))
      .with('ArrowLeft', () => ({ kind: 'handler' as const, handler: onLeft }))
      .with('ArrowRight', () => ({
        kind: 'handler' as const,
        handler: onRight,
      }))
      .with('Tab', () => ({
        kind: 'handler' as const,
        handler: e.shiftKey ? onUp : onDown,
      }))
      .with('j', () => ({
        kind: 'handler' as const,
        handler: e.ctrlKey || e.metaKey ? onDown : undefined,
      }))
      .with('k', () => ({
        kind: 'handler' as const,
        handler: e.ctrlKey || e.metaKey ? onUp : undefined,
      }))
      .with('n', () => ({
        kind: 'handler' as const,
        handler: e.ctrlKey ? onDown : undefined,
      }))
      .with('p', () => ({
        kind: 'handler' as const,
        handler: e.ctrlKey ? onUp : undefined,
      }))
      .with('Enter', () => ({
        kind: 'handler' as const,
        handler: onSelect,
      }))
      .with('Escape', () => ({ kind: 'handler' as const, handler: onClose }))
      .with(' ', () => {
        if (onSpace) {
          const shouldPrevent = onSpace(e);
          if (shouldPrevent) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
        return { kind: 'early-return' as const };
      })
      .otherwise(() => ({
        kind: 'handler' as const,
        handler: undefined as ((e: KeyboardEvent) => void) | undefined,
      }));

    if (result.kind === 'early-return') return;

    const handler = result.handler;
    if (handler) {
      if (preventDefault) {
        e.preventDefault();
        e.stopPropagation();
      }
      handler(e);
    } else {
      onOtherKey?.(e);
    }
  };

  return { handleKeyDown };
}

export function useMenuKeyboardNavigation(handlers: MenuKeyboardHandlers): {
  handleKeyDown: (e: KeyboardEvent) => void;
} {
  const { handleKeyDown } = createMenuKeyboardNavigation(handlers);
  const capture = handlers.capture ?? true;

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown, { capture });
    onCleanup(() => {
      document.removeEventListener('keydown', handleKeyDown, { capture });
    });
  });

  return { handleKeyDown };
}
