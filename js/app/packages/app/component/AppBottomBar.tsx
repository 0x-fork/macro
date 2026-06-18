import { useSettingsState } from '@core/constant/SettingsState';
import LogoIcon from '@icon/macro-logo.svg';
import GearIcon from '@phosphor/gear-six.svg';
import { Button } from '@ui';
import { createSignal, Show } from 'solid-js';
import { MacroAgentInputOverlay } from './MacroAgentLurker';

export function AppBottomBar() {
  const [askMounted, setAskMounted] = createSignal(false);
  const [askOpen, setAskOpen] = createSignal(false);
  const [askHasActiveChat, setAskHasActiveChat] = createSignal(false);
  const { openSettings } = useSettingsState();

  return (
    <>
      <Show when={askMounted()}>
        <MacroAgentInputOverlay
          hidden={!askOpen()}
          onMinimize={() => setAskOpen(false)}
          onClose={() => {
            setAskOpen(false);
            setAskMounted(false);
            setAskHasActiveChat(false);
          }}
          onActiveChatChange={setAskHasActiveChat}
          positionClass="right-10 bottom-9 justify-end px-2"
          panelClass="w-[26rem] max-w-[calc(100vw-1rem)]"
          inlineChat
        />
      </Show>
      <div class="shrink-0 flex justify-end gap-1 px-2 pb-1.5">
        <Button
          variant="ghost"
          size="sm"
          class="ask-macro-button h-6 rounded-md px-2 text-xs font-semibold text-ink/75 hover:text-ink gap-1.5"
          onClick={() => {
            setAskMounted(true);
            setAskOpen((open) => !open);
          }}
          aria-label="Ask Macro"
        >
          <LogoIcon class="ask-macro-logo-shimmer size-3.5 shrink-0 text-ink-muted" />
          <span>Ask Macro</span>
          <Show when={askHasActiveChat()}>
            <span class="ml-0.5 size-1.5 rounded-full bg-accent" />
          </Show>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="size-6 rounded-md text-ink-muted hover:text-ink"
          tooltip="Settings"
          aria-label="Settings"
          onClick={() => openSettings()}
        >
          <GearIcon class="size-4" />
        </Button>
      </div>
    </>
  );
}
