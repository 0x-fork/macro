import { PcNoiseGrid } from '@core/component/PcNoiseGrid';
import HomeIcon from '@icon/regular/house.svg';
import UnknownIcon from '@macro-icons/pixel/unknown.svg';
import { logger } from '@observability';
import { Button } from '@ui/components/Button';

const HINTS = [
  'Double-check the URL for typos.',
  'This link may have expired.',
  'The page might have been moved.',
  'Try searching for what you need.',
  'Links can be fickle sometimes.',
];

function getRandomHint(): string {
  return HINTS[Math.floor(Math.random() * HINTS.length)];
}

export function NotFoundPage() {
  logger.warn('404 - Page not found', {
    url: window.location.href,
  });

  const hint = getRandomHint();

  return (
    <div class="relative h-screen w-screen bg-panel overflow-hidden">
      <div class="absolute inset-0 w-full h-full text-accent bg-panel opacity-10 pointer-events-none">
        <PcNoiseGrid
          cellSize={30}
          warp={0}
          crunch={0.2}
          freq={0.001}
          size={[0, 0.3]}
          rounding={0}
          fill={0}
          stroke={1}
          speed={[0.1, 0.5]}
        />
      </div>

      <div class="relative z-10 h-full flex flex-col items-center justify-center gap-8 p-8">
        <UnknownIcon class="size-32 text-ink-extra-muted" />

        <div class="flex flex-col items-center gap-1">
          <h1 class="text-2xl font-semibold text-ink text-center">
            Looks like you took a wrong turn
          </h1>
          <p class="text-subtle text-center max-w-md">
            This page doesn't exist. Let's get you back on track.
          </p>
        </div>

        <Button
          variant="accent"
          class="px-6"
          onClick={() => {
            window.location.href = window.location.origin + '/app';
          }}
        >
          <HomeIcon class="size-5" />
          Take me home
        </Button>

        <p class="text-ink-extra-muted text-sm">{hint}</p>
      </div>
    </div>
  );
}
