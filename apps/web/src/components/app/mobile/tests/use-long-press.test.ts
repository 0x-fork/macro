import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLongPress } from '../use-long-press';

const pointer = (x: number, y: number, pointerType = 'touch'): PointerEvent =>
  ({ clientX: x, clientY: y, pointerType }) as PointerEvent;

afterEach(() => vi.useRealTimers());

describe('useLongPress', () => {
  it('triggers after the delay and consumes the following click', async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const onPressChange = vi.fn();
    let consumeLongPress: (event?: Event) => boolean = () => false;
    let disposeRoot = () => {};

    createRoot((dispose) => {
      disposeRoot = dispose;
      const press = useLongPress({ onLongPress, onPressChange });
      consumeLongPress = press.consumeLongPress;
      press.longPressHandlers.onPointerDown(pointer(10, 10));
      expect(onPressChange).toHaveBeenLastCalledWith(true);
      vi.advanceTimersByTime(449);
      expect(onLongPress).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onLongPress).toHaveBeenCalledOnce();
      expect(onPressChange).toHaveBeenLastCalledWith(false);
    });

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event;
    expect(consumeLongPress(event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(consumeLongPress()).toBe(false);
    disposeRoot();
  });

  it('cancels when movement exceeds the threshold or the owner disposes', () => {
    vi.useFakeTimers();
    const moved = vi.fn();
    const onPressChange = vi.fn();
    createRoot((dispose) => {
      const press = useLongPress({ onLongPress: moved, onPressChange });
      press.longPressHandlers.onPointerDown(pointer(0, 0));
      press.longPressHandlers.onPointerMove(pointer(9, 0));
      vi.runAllTimers();
      expect(moved).not.toHaveBeenCalled();
      expect(onPressChange.mock.calls).toEqual([[true], [false]]);
      dispose();
    });

    const disposed = vi.fn();
    createRoot((dispose) => {
      const press = useLongPress({ onLongPress: disposed });
      press.longPressHandlers.onPointerDown(pointer(0, 0));
      dispose();
    });
    vi.runAllTimers();
    expect(disposed).not.toHaveBeenCalled();
  });

  it('ignores non-touch pointers by default', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    createRoot((dispose) => {
      const press = useLongPress({ onLongPress });
      press.longPressHandlers.onPointerDown(pointer(0, 0, 'mouse'));
      vi.runAllTimers();
      expect(onLongPress).not.toHaveBeenCalled();
      dispose();
    });
  });
});
