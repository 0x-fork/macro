import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { AnimatedChatIcon } from '@icon/wide-chat';
import { AnimatedDiagramIcon } from '@icon/wide-diagram';
import { AnimatedEmailIcon } from '@icon/wide-email';
import { AnimatedFileCodeIcon } from '@icon/wide-fileCode';
import { AnimatedFileMdIcon } from '@icon/wide-fileMd';
import { AnimatedFolderIcon } from '@icon/wide-folder';
import { AnimatedStarIcon } from '@icon/wide-star';
import { AnimatedTaskIcon } from '@icon/wide-task';
import { RadialMenu, type RadialMenuItem } from '@ui';
import { createSignal, onMount } from 'solid-js';
import { useRadialMenu } from './useRadialMenu';

export function RadialMenuDemo() {
  const [lastAction, setLastAction] = createSignal('—');
  const act = (name: string) => () => setLastAction(name);

  // Eight macro actions on the default (outer) ring, each with its animated macro
  // icon. Hotkeys mirror the app launcher.
  const outerItems: RadialMenuItem[] = [
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

  // A second (inner) ring of eight text actions, hotkeys 1–8 (distinct from outer).
  const innerItems: RadialMenuItem[] = [
    {
      ring: 'inner',
      slots: ['N'],
      label: 'Bold',
      hotkey: '1',
      onSelect: act('Bold'),
    },
    {
      ring: 'inner',
      slots: ['NE'],
      label: 'Italic',
      hotkey: '2',
      onSelect: act('Italic'),
    },
    {
      ring: 'inner',
      slots: ['E'],
      label: 'Link',
      hotkey: '3',
      onSelect: act('Link'),
    },
    {
      ring: 'inner',
      slots: ['SE'],
      label: 'Code',
      hotkey: '4',
      onSelect: act('Code (inline)'),
    },
    {
      ring: 'inner',
      slots: ['S'],
      label: 'Quote',
      hotkey: '5',
      onSelect: act('Quote'),
    },
    {
      ring: 'inner',
      slots: ['SW'],
      label: 'List',
      hotkey: '6',
      onSelect: act('List'),
    },
    {
      ring: 'inner',
      slots: ['W'],
      label: 'Strike',
      hotkey: '7',
      onSelect: act('Strike'),
    },
    {
      ring: 'inner',
      slots: ['NW'],
      label: 'Clear',
      hotkey: '8',
      onSelect: act('Clear'),
    },
  ];

  const twoRingItems = [...outerItems, ...innerItems];

  let containerEl!: HTMLDivElement;
  // One shared DOM hotkey scope hosts both triggers.
  const [attachScope, scopeId] = useHotkeyDOMScope('radial-menu-demo');
  onMount(() => {
    attachScope(containerEl);
    containerEl.focus();
  });

  // `c` → single (outer) ring; `v` → two rings. Each hook owns its own
  // open/anchor/mode + command scope, sharing the demo's DOM scope.
  const single = useRadialMenu({
    items: outerItems,
    triggerHotkey: 'c',
    triggerDescription: 'Open the radial menu',
    scopeId,
  });
  const dual = useRadialMenu({
    items: twoRingItems,
    triggerHotkey: 'v',
    triggerDescription: 'Open the two-ring radial menu',
    scopeId,
  });

  return (
    <div
      ref={containerEl}
      tabindex={-1}
      class="relative size-full overflow-hidden bg-surface text-ink outline-none"
      // Right-click opens the single-ring menu, sticky, at the cursor.
      onContextMenu={(e) => {
        e.preventDefault();
        single.openAt(e.clientX, e.clientY, 'toggle');
      }}
    >
      <div class="absolute left-1/2 top-10 flex max-w-md -translate-x-1/2 flex-col items-center gap-3 rounded-lg border border-edge bg-surface p-6 text-center shadow-lg">
        <h1 class="text-lg font-semibold">Radial menu demo</h1>

        <p class="text-sm text-ink-muted">
          Tap{' '}
          <kbd class="rounded border border-edge-muted px-1.5 py-0.5 font-mono text-xs">
            C
          </kbd>{' '}
          (or right-click) for one ring, or{' '}
          <kbd class="rounded border border-edge-muted px-1.5 py-0.5 font-mono text-xs">
            V
          </kbd>{' '}
          for two rings (aim near the center for the inner ring, farther out for
          the outer). Click a slice or press its hotkey; hold the trigger, aim,
          and release to choose in one gesture. Esc / center cancels.
        </p>

        <div class="flex gap-6 text-sm">
          <p>
            Mode:{' '}
            <span class="font-mono font-medium capitalize text-accent">
              {single.open() ? single.mode() : dual.open() ? dual.mode() : '—'}
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
        open={single.open()}
        x={single.x()}
        y={single.y()}
        mode={single.mode()}
        items={outerItems}
        onOpenChange={single.setOpen}
        activeItemRef={single.activeItemRef}
      />
      <RadialMenu
        open={dual.open()}
        x={dual.x()}
        y={dual.y()}
        mode={dual.mode()}
        items={twoRingItems}
        onOpenChange={dual.setOpen}
        activeItemRef={dual.activeItemRef}
      />
    </div>
  );
}

export default RadialMenuDemo;
