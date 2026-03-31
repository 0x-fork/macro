import { LIST_VIEW_PATHS } from '@app/constants/list-views';
import { PcNoiseGrid } from '@core/component/PcNoiseGrid';
import { AnimatedChannelIcon } from '@macro-icons/wide/animating/channel';
import { AnimatedEmailIcon } from '@macro-icons/wide/animating/email';
import { AnimatedFileMdIcon } from '@macro-icons/wide/animating/fileMd';
import { AnimatedInboxIcon } from '@macro-icons/wide/animating/inbox';
import { AnimatedStarIcon } from '@macro-icons/wide/animating/star';
import { AnimatedTaskIcon } from '@macro-icons/wide/animating/task';
import { AnimatedFolderIcon } from '@macro-icons/wide/animating/folder';
import UnknownIcon from '@macro-icons/pixel/unknown.svg';
import { logger } from '@observability';
import { Button } from '@ui/components/Button';
import { For } from 'solid-js';
import { ROUTER_BASE_CONCAT } from '@app/constants/routerBase';

const QUICK_LINKS = [
  { label: 'Agents', href: LIST_VIEW_PATHS.agents, icon: AnimatedStarIcon },
  { label: 'Email', href: LIST_VIEW_PATHS.mail, icon: AnimatedEmailIcon },
  {
    label: 'Documents',
    href: LIST_VIEW_PATHS.documents,
    icon: AnimatedFileMdIcon,
  },
  { label: 'Tasks', href: LIST_VIEW_PATHS.tasks, icon: AnimatedTaskIcon },
  {
    label: 'Channels',
    href: LIST_VIEW_PATHS.channels,
    icon: AnimatedChannelIcon,
  },
  {
    label: 'Folders',
    href: LIST_VIEW_PATHS.folders,
    icon: AnimatedFolderIcon,
  },
];

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

        <div class="flex flex-col gap-4 items-center justify-center">
          <Button
            variant="accent"
            class="px-6 rounded-xs"
            onClick={() => {
              window.location.href = window.location.origin + '/app';
            }}
          >
            <AnimatedInboxIcon class="size-5" />
            Back to inbox
          </Button>

          <span class="font-mono">OR</span>

          <div class="flex gap-2">
            <For each={QUICK_LINKS}>
              {(link) => (
                <Button
                  variant="ghost"
                  size="icon-md"
                  class="rounded-xs"
                  tooltip={`Go to ${link.label}`}
                  onClick={() => {
                    window.location.href =
                      window.location.origin +
                      `${ROUTER_BASE_CONCAT}component${link.href}`;
                  }}
                >
                  <link.icon class="size-5" />
                </Button>
              )}
            </For>
          </div>
        </div>

        <p class="text-ink-extra-muted text-sm">{hint}</p>
      </div>
    </div>
  );
}
