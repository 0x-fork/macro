import { onCleanup } from 'solid-js';

export type LongPressOptions = {
  onLongPress: () => void;
  delay?: number;
  movementThreshold?: number;
  pointerType?: string;
};

/**
 * Owns touch long-press timing, movement cancellation, and suppression of the
 * click-like event emitted after a completed press.
 */
export function useLongPress(options: LongPressOptions) {
  const delay = options.delay ?? 450;
  const movementThreshold = options.movementThreshold ?? 8;
  const pointerType = options.pointerType ?? 'touch';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | undefined;
  let triggered = false;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    start = undefined;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== pointerType) return;
    triggered = false;
    cancel();
    start = { x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      timer = undefined;
      triggered = true;
      options.onLongPress();
    }, delay);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!start) return;
    if (
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >
      movementThreshold
    ) {
      cancel();
    }
  };

  const consumeLongPress = (event?: Event) => {
    if (!triggered) return false;
    event?.preventDefault();
    event?.stopPropagation();
    queueMicrotask(() => {
      triggered = false;
    });
    return true;
  };

  onCleanup(cancel);

  return {
    longPressHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancel,
      onPointerCancel: cancel,
    },
    consumeLongPress,
    cancelLongPress: cancel,
  };
}
