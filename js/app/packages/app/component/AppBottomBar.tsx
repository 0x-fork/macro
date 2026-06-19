import { useSettingsState } from '@core/constant/SettingsState';
import { ENABLE_APP_STORE_QR_CODE } from '@core/constant/featureFlags';
import { isNativeMobilePlatform } from '@core/mobile/isNativeMobilePlatform';
import AppStoreQr from '@design/app-store-qr.svg';
import LogoIcon from '@icon/macro-logo.svg';
import AppleLogoIcon from '@phosphor/apple-logo.svg';
import ArrowSquareOutIcon from '@phosphor/arrow-square-out.svg';
import GearIcon from '@phosphor/gear-six.svg';
import XIcon from '@phosphor/x.svg';
import { Button } from '@ui';
import { createSignal, Show } from 'solid-js';
import { MacroAgentInputOverlay } from './MacroAgentLurker';

export function AppBottomBar() {
  const [askMounted, setAskMounted] = createSignal(false);
  const [askOpen, setAskOpen] = createSignal(false);
  const [askHasActiveChat, setAskHasActiveChat] = createSignal(false);
  const [qrOpen, setQrOpen] = createSignal(false);
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
      <Show when={qrOpen()}>
        <div class="absolute left-2 bottom-12 z-[9999] pointer-events-auto">
          <div class="w-56 overflow-hidden rounded-2xl border border-edge-muted bg-surface/72 p-2 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--color-edge-muted)_80%,white),inset_0_0_24px_color-mix(in_oklch,var(--color-ink)_4%,transparent),0_24px_80px_-36px_rgba(0,0,0,0.55),0_8px_24px_-18px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150">
            <div class="mb-2 flex items-center justify-between px-1 text-xs font-medium text-ink/55">
              <span>Get the iOS app</span>
              <button
                type="button"
                class="rounded-md p-1 text-ink/45 hover:bg-ink/5 hover:text-ink transition-colors"
                aria-label="Close iOS app QR code"
                onClick={() => setQrOpen(false)}
              >
                <XIcon class="size-3.5" />
              </button>
            </div>
            <div class="flex flex-col items-center gap-2 px-1 pb-1">
              <div class="size-28 shrink-0 overflow-hidden rounded-sm bg-surface p-1 text-ink">
                <AppStoreQr style="display: block; width: 100%; height: 100%;" />
              </div>
              <a
                href="https://apps.apple.com/us/app/macro-app/id6743133649"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
              >
                <span>Open App Store</span>
                <ArrowSquareOutIcon class="size-3" />
              </a>
            </div>
          </div>
        </div>
      </Show>
      <div class="shrink-0 flex items-center justify-between gap-3 px-2 pb-1.5">
        <Show when={ENABLE_APP_STORE_QR_CODE && !isNativeMobilePlatform()}>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-ink-muted hover:bg-ink/3 hover:text-ink transition-colors"
            aria-label="Show iOS app QR code"
            onClick={() => setQrOpen((open) => !open)}
          >
            <AppleLogoIcon class="size-4 shrink-0 text-ink-muted" />
            <span class="min-w-0 text-xs font-medium leading-4 text-ink/70">
              Get the iOS app
            </span>
          </button>
        </Show>
        <div class="ml-auto flex items-center justify-end gap-1">
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
      </div>
    </>
  );
}
