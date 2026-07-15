/**
 * @file The global vim status bar.
 *
 * Mounted once at the app root. Renders a slim fixed bar along the bottom
 * edge while a vim-enabled markdown surface is focused, showing the current
 * mode plus any pending multi-key command (`d`, `2d`, `da`…), mirroring
 * vim's `showmode`/`showcmd`.
 */

import { Show } from 'solid-js';
import { match } from 'ts-pattern';
import { vimModeEnabled, vimStatus } from './vimSignals';

function modeLabel(): string {
  return match(vimStatus.mode)
    .with('normal', () => 'NORMAL')
    .with('insert', () => 'INSERT')
    .with('visual', () => 'VISUAL')
    .with('visual-line', () => 'V-LINE')
    .exhaustive();
}

function modeClasses(): string {
  return match(vimStatus.mode)
    .with('normal', () => 'bg-accent-bg text-accent')
    .with('insert', () => 'bg-success-bg text-success-ink')
    .with('visual', () => 'bg-alert-bg text-alert-ink')
    .with('visual-line', () => 'bg-alert-bg text-alert-ink')
    .exhaustive();
}

export function VimStatusBar() {
  return (
    <Show when={vimModeEnabled() && vimStatus.active}>
      <div
        aria-live="polite"
        class="fixed inset-x-0 bottom-0 flex h-6 items-center gap-2 border-t border-edge-muted bg-surface px-2 font-mono text-xs text-ink-muted"
        // Above dialogs — the focused editor may live inside one.
        style={{ 'z-index': 2147483000 }}
      >
        <span
          class={`rounded-xs px-1.5 py-px font-semibold tracking-wider ${modeClasses()}`}
        >
          {modeLabel()}
        </span>
        <Show when={vimStatus.pending}>
          <span class="text-ink">{vimStatus.pending}</span>
        </Show>
        <span class="ml-auto text-ink-extra-muted">vim</span>
      </div>
    </Show>
  );
}
