import { createEffect, createMemo, on, onCleanup, Show } from 'solid-js';
import type { LexicalEditor } from 'lexical';
import { useDangerMode } from './DangerModeContext';
import { ScopedPortal } from '@core/component/ScopedPortal';

const BLUR_START_HEALTH = 0.4;
const MAX_BLUR_PX = 10;

export function DangerModeOverlay(props: { editor: LexicalEditor }) {
  const dangerMode = useDangerMode();
  if (!dangerMode) return;

  const countdown = createMemo(() => {
    const config = dangerMode.config();
    if (config.goalType === 'time') {
      const ms = dangerMode.timeRemaining();
      const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    } else {
      const wordsWritten = dangerMode.timeRemaining();
      const remaining = Math.max(0, config.goalValue - wordsWritten);
      return `${remaining}`;
    }
  });

  // Blur effect on the editor root
  createEffect(
    on(
      () => [dangerMode.active(), dangerMode.health()] as const,
      ([active, health]) => {
        const rootEl = props.editor.getRootElement();
        if (!rootEl) return;

        if (!active) {
          rootEl.style.filter = '';
          return;
        }

        if (health < BLUR_START_HEALTH) {
          const blurAmount =
            ((BLUR_START_HEALTH - health) / BLUR_START_HEALTH) * MAX_BLUR_PX;
          rootEl.style.filter = `blur(${blurAmount}px)`;
        } else {
          rootEl.style.filter = '';
        }
      }
    )
  );

  // Clean up filter on unmount
  onCleanup(() => {
    const rootEl = props.editor.getRootElement();
    if (rootEl) {
      rootEl.style.filter = '';
    }
  });

  return (
    <Show when={dangerMode.active()}>
      {/* Countdown display */}
      <ScopedPortal scope="split">
        {' '}
        <div class="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-sm font-mono text-ink bg-panel px-2 py-1 rounded">
          {countdown()}
        </div>
        {/* Health bar - vertical, right margin */}
        <div class="absolute top-1/3 right-2 bottom-1/3 w-2 z-10 rounded-full overflow-hidden bg-panel">
          {/* Clip container: anchored to bottom, height = health %. Rounded + overflow-hidden gives rounded ends. */}
          <div
            class="absolute bottom-0 left-0 right-0 rounded-full overflow-hidden transition-[height] duration-100"
            style={{ height: `${dangerMode.health() * 100}%` }}
          >
            {/* Gradient fill: sized to the full track height so it stays fixed as health shrinks. */}
            <div
              class="absolute bottom-0 left-0 right-0"
              style={{
                height: `${100 / Math.max(dangerMode.health(), 0.01)}%`,
                background:
                  'linear-gradient(to bottom, var(--color-accent), var(--color-edge))',
              }}
            />
          </div>
        </div>
      </ScopedPortal>
    </Show>
  );
}
