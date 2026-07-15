import { hapticImpact } from '@core/mobile/haptics';
import { isMobile } from '@core/mobile/isMobile';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
} from 'solid-js';

const DIRECTIONALITY_THRESHOLD = 5;
const PULL_RESISTANCE = 0.5;
const PULL_THRESHOLD = 60;
const OVERDRAG_RESISTANCE = 0.25;
const OVERDRAG_FADE = 40;
const SETTLE_MS = 250;
const MIN_REFRESH_SPIN_MS = 200;
const REFRESH_TIMEOUT_MS = 8000;

export type PullToRefreshPhase = 'idle' | 'pulling' | 'refreshing' | 'settling';

type PullGesture = {
  startX: number;
  startY: number;
  pulling: boolean | null;
};

export type UsePullToRefreshOptions = {
  scrollContainer: Accessor<HTMLElement | undefined>;
  onRefresh: () => Promise<unknown>;
  enabled?: Accessor<boolean>;
  onError?: (error: unknown) => void;
};

export type PullToRefreshState = {
  phase: Accessor<PullToRefreshPhase>;
  distance: Accessor<number>;
  progress: Accessor<number>;
  armed: Accessor<boolean>;
  refreshing: Accessor<boolean>;
};

/**
 * Headless touch pull-to-refresh behavior. The hook owns the gesture and
 * translates the supplied scroll element; the consumer owns all indicator UI.
 */
export function usePullToRefresh(
  options: UsePullToRefreshOptions
): PullToRefreshState {
  const [phase, setPhase] = createSignal<PullToRefreshPhase>('idle');
  const [distance, setDistance] = createSignal(0);

  let gesture: PullGesture | null = null;
  let settleTimer: number | undefined;
  let refreshTimeout: number | undefined;
  let minimumSpinTimer: number | undefined;

  const clearTimers = () => {
    window.clearTimeout(settleTimer);
    window.clearTimeout(refreshTimeout);
    window.clearTimeout(minimumSpinTimer);
  };
  onCleanup(clearTimers);

  const retract = () => {
    setPhase('settling');
    setDistance(0);
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => setPhase('idle'), SETTLE_MS);
  };

  const triggerRefresh = () => {
    setPhase('refreshing');
    setDistance(PULL_THRESHOLD);

    const minimumSpin = new Promise<void>((resolve) => {
      minimumSpinTimer = window.setTimeout(resolve, MIN_REFRESH_SPIN_MS);
    });
    const timeout = new Promise<never>((_, reject) => {
      refreshTimeout = window.setTimeout(
        () => reject(new Error('Refresh timed out')),
        REFRESH_TIMEOUT_MS
      );
    });
    const refresh = Promise.resolve().then(() => options.onRefresh());

    void Promise.allSettled([
      Promise.race([refresh, timeout]),
      minimumSpin,
    ]).then(([refreshResult]) => {
      window.clearTimeout(refreshTimeout);
      window.clearTimeout(minimumSpinTimer);
      if (refreshResult.status === 'rejected') {
        options.onError?.(refreshResult.reason);
      }
      retract();
    });
  };

  const cancelGesture = () => {
    if (!gesture) return;
    const wasPulling = gesture.pulling === true;
    gesture = null;
    if (wasPulling) retract();
  };

  const onTouchStart = (event: TouchEvent) => {
    if (!(options.enabled?.() ?? isMobile()) || phase() !== 'idle') return;
    if (event.touches.length !== 1) return;

    const container = options.scrollContainer();
    if (!container || container.scrollTop > 0) return;

    const touch = event.touches[0];
    gesture = {
      startX: touch.clientX,
      startY: touch.clientY,
      pulling: null,
    };
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!gesture) return;
    if (event.touches.length !== 1) {
      cancelGesture();
      return;
    }

    const touch = event.touches[0];
    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;

    if (gesture.pulling === null) {
      if (
        Math.abs(dx) < DIRECTIONALITY_THRESHOLD &&
        Math.abs(dy) < DIRECTIONALITY_THRESHOLD
      ) {
        return;
      }

      gesture.pulling = dy > Math.abs(dx);
      if (!gesture.pulling) {
        gesture = null;
        return;
      }
      setPhase('pulling');
    }

    if (event.cancelable) event.preventDefault();

    const base = Math.max(dy - DIRECTIONALITY_THRESHOLD, 0) * PULL_RESISTANCE;
    const over = Math.max(base - PULL_THRESHOLD, 0);
    const damped =
      Math.min(base, PULL_THRESHOLD) +
      OVERDRAG_RESISTANCE * over +
      (1 - OVERDRAG_RESISTANCE) *
        OVERDRAG_FADE *
        (1 - Math.exp(-over / OVERDRAG_FADE));
    const wasArmed = distance() >= PULL_THRESHOLD;
    setDistance(damped);
    if (damped >= PULL_THRESHOLD !== wasArmed) hapticImpact('light');
  };

  const onTouchEnd = () => {
    if (!gesture) return;
    const wasPulling = gesture.pulling === true;
    gesture = null;
    if (!wasPulling) return;

    if (distance() >= PULL_THRESHOLD) triggerRefresh();
    else retract();
  };

  const scrollContainer = createMemo(() => options.scrollContainer());

  createEffect(
    on(scrollContainer, (element) => {
      if (!element) return;

      element.addEventListener('touchstart', onTouchStart, { passive: true });
      element.addEventListener('touchmove', onTouchMove, { passive: false });
      element.addEventListener('touchend', onTouchEnd, { passive: true });
      element.addEventListener('touchcancel', cancelGesture, {
        passive: true,
      });

      createEffect(() => {
        element.style.transform =
          distance() > 0 ? `translateY(${distance()}px)` : '';
        element.style.transition =
          phase() === 'pulling' ? '' : `transform ${SETTLE_MS}ms ease-out`;
      });

      onCleanup(() => {
        cancelGesture();
        element.style.transform = '';
        element.style.transition = '';
        element.removeEventListener('touchstart', onTouchStart);
        element.removeEventListener('touchmove', onTouchMove);
        element.removeEventListener('touchend', onTouchEnd);
        element.removeEventListener('touchcancel', cancelGesture);
      });
    })
  );

  return {
    phase,
    distance,
    progress: () => Math.min(distance() / PULL_THRESHOLD, 1),
    armed: () => distance() >= PULL_THRESHOLD,
    refreshing: () => phase() === 'refreshing',
  };
}
