import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { AnimatedChatIcon } from '@icon/wide-chat';
import { AnimatedDiagramIcon } from '@icon/wide-diagram';
import { AnimatedEmailIcon } from '@icon/wide-email';
import { AnimatedFileCodeIcon } from '@icon/wide-fileCode';
import { AnimatedFileMdIcon } from '@icon/wide-fileMd';
import { AnimatedFolderIcon } from '@icon/wide-folder';
import { AnimatedStarIcon } from '@icon/wide-star';
import { AnimatedTaskIcon } from '@icon/wide-task';
import { RadialMenu, type RadialMenuItem, type RadialMenuMode } from '@ui';
import { createSignal, onMount } from 'solid-js';
import { useRadialMenu } from './useRadialMenu';

export function RadialMenuDemo() {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal({ x: 0, y: 0 });
  // The mode we open with. The menu may transition it (hold tap → toggle) and
  // report the effective mode back via onModeChange.
  const [openMode, setOpenMode] = createSignal<RadialMenuMode>('toggle');
  const [activeMode, setActiveMode] = createSignal<RadialMenuMode>('toggle');
  const [lastAction, setLastAction] = createSignal('—');

  // Latest cursor position, so the `c` hotkey can open at the cursor.
  let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  const openAt = (x: number, y: number, mode: RadialMenuMode) => {
    setOpenMode(mode);
    setAnchor({ x, y });
    setOpen(true);
  };

  const act = (name: string) => () => setLastAction(name);

  // One ring of eight macro actions, each with its animated macro icon. Hotkeys
  // mirror the app launcher.
  const items: RadialMenuItem[] = [
    {
      id: 'doc',
      slots: ['N'],
      label: 'Doc',
      icon: AnimatedFileMdIcon,
      hotkey: 'd',
      onSelect: act('Doc'),
    },
    {
      id: 'task',
      slots: ['NE'],
      label: 'Task',
      icon: AnimatedTaskIcon,
      hotkey: 't',
      onSelect: act('Task'),
    },
    {
      id: 'email',
      slots: ['E'],
      label: 'Email',
      icon: AnimatedEmailIcon,
      hotkey: 'e',
      onSelect: act('Email'),
    },
    {
      id: 'message',
      slots: ['SE'],
      label: 'Message',
      icon: AnimatedChatIcon,
      hotkey: 'm',
      onSelect: act('Message'),
    },
    {
      id: 'agent',
      slots: ['S'],
      label: 'Agent',
      icon: AnimatedStarIcon,
      hotkey: 'a',
      onSelect: act('Agent'),
    },
    {
      id: 'canvas',
      slots: ['SW'],
      label: 'Canvas',
      icon: AnimatedDiagramIcon,
      hotkey: 'n',
      onSelect: act('Canvas'),
    },
    {
      id: 'folder',
      slots: ['W'],
      label: 'Folder',
      icon: AnimatedFolderIcon,
      hotkey: 'f',
      onSelect: act('Folder'),
    },
    {
      id: 'code',
      slots: ['NW'],
      label: 'Code',
      icon: AnimatedFileCodeIcon,
      hotkey: 'o',
      onSelect: act('Code'),
    },
  ];

  // Drive the `c` trigger through the app's real hotkey system. Pressing `c`
  // opens at the cursor in hold mode; the menu commits the aimed slice on
  // release, or — if `c` was just tapped (nothing aimed) — stays open as a
  // sticky (toggle) menu.
  let containerEl!: HTMLDivElement;
  const [attachScope, demoScope] = useHotkeyDOMScope('radial-menu-demo');

  // `c` opens at the cursor (hold mode); item shortcuts (d/t/e/…) are registered
  // in a command scope that's active only while the menu is open.
  useRadialMenu({
    scopeId: demoScope,
    items,
    isOpen: open,
    triggerHotkey: 'c',
    triggerDescription: 'Open the radial menu',
    onTrigger: () => openAt(pointer.x, pointer.y, 'hold'),
    onSelect: (item) => {
      item.onSelect();
      setOpen(false);
    },
  });

  onMount(() => {
    attachScope(containerEl);
    // Focus the surface so its hotkey scope is active immediately.
    containerEl.focus();
  });

  return (
    <div
      ref={containerEl}
      tabindex={-1}
      class="relative size-full overflow-hidden bg-surface text-ink outline-none"
      onPointerMove={(e) => {
        pointer = { x: e.clientX, y: e.clientY };
      }}
      // Right-click opens a sticky (toggle) menu at the cursor.
      onContextMenu={(e) => {
        e.preventDefault();
        openAt(e.clientX, e.clientY, 'toggle');
      }}
    >
      <div
        class="absolute left-1/2 top-10 flex w-1/2 -translate-x-1/2 flex-col gap-3 rounded-lg border border-edge bg-surface p-6 shadow-lg"
        onContextMenu={(e) => e.stopPropagation()}
      >
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
              {open() ? activeMode() : '—'}
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
        open={open()}
        x={anchor().x}
        y={anchor().y}
        mode={openMode()}
        items={items}
        onOpenChange={setOpen}
        onModeChange={setActiveMode}
      />
    </div>
  );
}

export default RadialMenuDemo;
