import { toast } from '@core/component/Toast/Toast';
import { isMobile } from '@core/mobile/isMobile';
import Spinner from '@phosphor-icons/core/bold/spinner-bold.svg';
import { cn } from '@ui';
import { type Accessor, Show } from 'solid-js';
import { usePullToRefresh } from './use-pull-to-refresh';

/**
 * Default pull-to-refresh indicator. Consumers that need different rendering
 * can use `usePullToRefresh` directly and render from its returned state.
 */
export function PullToRefresh(props: {
  scrollContainer: Accessor<HTMLElement | undefined>;
  onRefresh: () => Promise<unknown>;
}) {
  const pull = usePullToRefresh({
    scrollContainer: () => props.scrollContainer(),
    onRefresh: () => props.onRefresh(),
    enabled: isMobile,
    onError: () => toast.failure('Failed to refresh'),
  });

  return (
    <Show when={isMobile()}>
      <div
        class="pointer-events-none absolute inset-x-0 flex justify-center"
        style={{ top: 'var(--mobile-content-inset-top, 0px)' }}
        aria-hidden
      >
        <div
          class="flex items-center justify-center rounded-full"
          style={{
            opacity: Math.min(pull.progress() * 1.5, 1),
            transition:
              pull.phase() === 'pulling' ? undefined : 'opacity 250ms ease-out',
          }}
        >
          <Spinner
            class={cn('size-7', pull.refreshing() && 'animate-spin')}
            style={
              pull.refreshing()
                ? undefined
                : { transform: `rotate(${pull.distance() * 3}deg)` }
            }
          />
        </div>
      </div>
    </Show>
  );
}
