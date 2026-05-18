import { createMemo, For } from 'solid-js';
import { hotkeyTokenMap } from '@core/hotkey/state';
import { TOKENS } from '@core/hotkey/tokens';
import { getPrettyHotkeyStringByToken } from '@core/hotkey/utils';
import { Hotkey } from '@ui';

const MARQUEE_TOKENS = [
  { token: TOKENS.entity.open, fallbackLabel: 'Open' },
  { token: TOKENS.global.commandMenu, fallbackLabel: 'Actions' },
  { token: TOKENS.entity.action.markDone, fallbackLabel: 'Mark done' },
  { token: TOKENS.entity.action.copyLink, fallbackLabel: 'Copy link' },
  { token: TOKENS.soup.openSearch, fallbackLabel: 'Search' },
  { token: TOKENS.entity.action.delete, fallbackLabel: 'Delete' },
  { token: TOKENS.entity.action.assignee, fallbackLabel: 'Assign' },
] as const;

const TipItem = (props: { token: (typeof MARQUEE_TOKENS)[number]['token']; label: string }) => (
  <span class="inline-flex items-center gap-1.5 mx-4">
    <span>{props.label}</span>
    <Hotkey token={props.token} theme="subtle" />
  </span>
);

export const FooterMarquee = () => {
  const tips = createMemo(() => {
    const tokenMap = hotkeyTokenMap();
    return MARQUEE_TOKENS.map(({ token, fallbackLabel }) => {
      const command = tokenMap.get(token)?.[0];
      const shortcut = getPrettyHotkeyStringByToken(token);
      const description = command?.description;
      const label = typeof description === 'function' ? description() : description;
      return {
        token,
        shortcut: shortcut ?? '?',
        label: label ?? fallbackLabel,
      };
    }).filter((tip) => tip.shortcut !== '?');
  });

  return (
    <div class="relative overflow-hidden h-6 flex items-center">
      {/* Left diagonal pattern - behind marquee */}
      <div class="absolute left-0 top-0 bottom-0 w-4 z-0">
        <div class="absolute inset-0 pattern-diagonal-6 [--pattern-color:var(--color-ink-extra-muted)] opacity-30" />
      </div>

      {/* Marquee content */}
      <div class="relative z-10 flex whitespace-nowrap animate-[marquee_45s_linear_infinite] text-ink-extra-muted/60 text-xs">
        <span class="flex items-center">
          <For each={tips()}>{(tip) => <TipItem token={tip.token} label={tip.label} />}</For>
        </span>
        <span class="flex items-center">
          <For each={tips()}>{(tip) => <TipItem token={tip.token} label={tip.label} />}</For>
        </span>
      </div>

      {/* Right diagonal pattern - behind marquee */}
      <div class="absolute right-0 top-0 bottom-0 w-4 z-0">
        <div class="absolute inset-0 pattern-diagonal-6 [--pattern-color:var(--color-ink-extra-muted)] opacity-30" />
      </div>

      {/* Gradient fades - in front to mask text at edges */}
      <div class="absolute left-0 top-0 bottom-0 w-4 z-20 bg-gradient-to-r from-panel via-panel/60 to-transparent pointer-events-none" />
      <div class="absolute right-0 top-0 bottom-0 w-4 z-20 bg-gradient-to-l from-panel via-panel/60 to-transparent pointer-events-none" />
    </div>
  );
};
