import { AnimatedChatIcon } from '@icon/wide-chat';
import { AnimatedDiagramIcon } from '@icon/wide-diagram';
import { AnimatedEmailIcon } from '@icon/wide-email';
import { AnimatedFileCodeIcon } from '@icon/wide-fileCode';
import { AnimatedFileMdIcon } from '@icon/wide-fileMd';
import { AnimatedFolderIcon } from '@icon/wide-folder';
import { AnimatedStarIcon } from '@icon/wide-star';
import { AnimatedTaskIcon } from '@icon/wide-task';
import { RadialMenu, type RadialMenuItem } from '@ui';
import { createSignal } from 'solid-js';
import { useRadialMenu } from './useRadialMenu';

export function RadialMenuDemo() {
  const [lastAction, setLastAction] = createSignal('—');
  const act = (name: string) => () => setLastAction(name);

  // One ring of eight macro actions, each with its animated macro icon. Hotkeys
  // mirror the app launcher.
  const items: RadialMenuItem[] = [
    {
      slots: ['N'],
      label: 'Doc',
      icon: AnimatedFileMdIcon,
      hotkey: 'd',
      onSelect: act('Doc'),
    },
    {
      slots: ['NE'],
      label: 'Task',
      icon: AnimatedTaskIcon,
      hotkey: 't',
      onSelect: act('Task'),
    },
    {
      slots: ['E'],
      label: 'Email',
      icon: AnimatedEmailIcon,
      hotkey: 'e',
      onSelect: act('Email'),
    },
    {
      slots: ['SE'],
      label: 'Message',
      icon: AnimatedChatIcon,
      hotkey: 'm',
      onSelect: act('Message'),
    },
    {
      slots: ['S'],
      label: 'Agent',
      icon: AnimatedStarIcon,
      hotkey: 'a',
      onSelect: act('Agent'),
    },
    {
      slots: ['SW'],
      label: 'Canvas',
      icon: AnimatedDiagramIcon,
      hotkey: 'n',
      onSelect: act('Canvas'),
    },
    {
      slots: ['W'],
      label: 'Folder',
      icon: AnimatedFolderIcon,
      hotkey: 'f',
      onSelect: act('Folder'),
    },
    {
      slots: ['NW'],
      label: 'Code',
      icon: AnimatedFileCodeIcon,
      hotkey: 'o',
      onSelect: act('Code'),
    },
  ];

  let containerEl!: HTMLDivElement;
  // The hook owns open / anchor / mode / pointer and the hotkey wiring.
  const menu = useRadialMenu({
    items,
    triggerHotkey: 'c',
    triggerDescription: 'Open the radial menu',
    element: () => containerEl,
  });

  return (
    <div
      ref={containerEl}
      tabindex={-1}
      class="relative size-full overflow-hidden bg-surface text-ink outline-none"
      // Right-click opens a sticky (toggle) menu at the cursor.
      onContextMenu={(e) => {
        e.preventDefault();
        menu.openAt(e.clientX, e.clientY, 'toggle');
      }}
    >
      <div class="absolute left-1/2 top-10 flex max-w-sm -translate-x-1/2 flex-col items-center gap-3 rounded-lg border border-edge bg-surface p-6 text-center shadow-lg">
        <h1 class="text-lg font-semibold">Radial menu demo</h1>

        <p class="text-sm text-ink-muted">
          Tap{' '}
          <kbd class="rounded border border-edge-muted px-1.5 py-0.5 font-mono text-xs">
            C
          </kbd>{' '}
          (or right-click) to open a sticky menu, then click a slice or press
          its hotkey. Or hold{' '}
          <kbd class="rounded border border-edge-muted px-1.5 py-0.5 font-mono text-xs">
            C
          </kbd>
          , aim, and release to choose in one gesture. Esc / center cancels.
        </p>

        <div class="flex gap-6 text-sm">
          <p>
            Mode:{' '}
            <span class="font-mono font-medium capitalize text-accent">
              {menu.open() ? menu.mode() : '—'}
            </span>
          </p>
          <p>
            Last action:{' '}
            <span class="font-mono font-medium text-accent">
              {lastAction()}
            </span>
          </p>
        </div>
      </div>

      <RadialMenu
        open={menu.open()}
        x={menu.x()}
        y={menu.y()}
        mode={menu.mode()}
        items={items}
        onOpenChange={menu.setOpen}
        activeItemRef={menu.activeItemRef}
      />
    </div>
  );
}

export default RadialMenuDemo;
