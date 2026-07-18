import { MACRO_EMAIL_SIGNATURE } from '@block-email/constants';
import { useHasPaidAccess } from '@core/auth';
import { PaywallKey, usePaywallState } from '@core/constant/PaywallState';
import { useUserContext } from '@core/context/user';
import { Button, Dialog, Panel, Tooltip } from '@ui';
import {
  emailWatermarkEnabled,
  setEmailWatermarkEnabled,
} from '@ui/signals/signals';
import { createSignal, Show } from 'solid-js';

interface MacroSignatureButtonProps {
  signature?: string;
}

/**
 * The "Sent from my Macro" watermark preview shown in the compose footer.
 *
 * - Free users: clicking opens the remove-signature paywall (unchanged).
 * - Paid users: the watermark doubles as their referral link, on by default.
 *   Clicking opens a confirmation explaining the referral reward before
 *   letting them turn it off (re-enable any time in Settings → Connections).
 */
export const MacroSignatureButton = (props: MacroSignatureButtonProps) => {
  const paywall = usePaywallState();
  const hasPaidAccess = useHasPaidAccess();
  const { isLoading } = useUserContext();
  const [confirmOpen, setConfirmOpen] = createSignal(false);

  return (
    <Show when={!isLoading() && (!hasPaidAccess() || emailWatermarkEnabled())}>
      <Tooltip
        label={
          hasPaidAccess()
            ? 'This is your referral link — click to remove'
            : 'Subscribe to remove watermark'
        }
      >
        <button
          type="button"
          class="hover:bg-hover pointer-events-all"
          tabindex={-1}
          // The text area uses non delegated events to capture on click and restore focus
          // to the editor. We want to capture the click here so we can open the paywall
          // (or the referral confirmation). That's why we use `on:click` instead of `onClick`
          on:click={(e) => {
            e.stopImmediatePropagation();
            if (hasPaidAccess()) {
              setConfirmOpen(true);
            } else {
              paywall.showPaywall(PaywallKey.REMOVE_SIGNATURE);
            }
          }}
        >
          {props.signature ?? MACRO_EMAIL_SIGNATURE}
        </button>
      </Tooltip>
      <Dialog
        open={confirmOpen()}
        onOpenChange={setConfirmOpen}
        position="center"
        class="w-120"
      >
        <Panel depth={2} class="rounded-xl">
          <Panel.Header class="px-6">
            <Dialog.Title class="text-ink text-sm font-semibold">
              Remove your referral link?
            </Dialog.Title>
          </Panel.Header>
          <Panel.Body class="p-6 font-sans flex flex-col gap-3">
            <Dialog.Description class="text-ink-muted text-sm/tight font-normal">
              "{MACRO_EMAIL_SIGNATURE}" is your personal referral link — when
              someone signs up through it, you get $100 in credits. Removing it
              turns it off for all future emails. You can turn it back on in
              Settings → Connections.
            </Dialog.Description>
            <div class="pt-3 justify-end items-center gap-3 inline-flex">
              <Button
                variant="base"
                depth={3}
                onClick={() => setConfirmOpen(false)}
              >
                Keep it
              </Button>
              <Button
                variant="active"
                depth={3}
                onClick={() => {
                  setEmailWatermarkEnabled(false);
                  setConfirmOpen(false);
                }}
              >
                Remove
              </Button>
            </div>
          </Panel.Body>
        </Panel>
      </Dialog>
    </Show>
  );
};
