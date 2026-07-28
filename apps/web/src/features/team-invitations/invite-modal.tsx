import { analytics } from '@app/lib/analytics';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { toast } from '@core/component/Toast/Toast';
import { useReferralCode } from '@core/context/user';

import { getWebOrigin } from '@core/util/webOrigin';
import ClipboardIcon from '@phosphor/clipboard.svg';
import CloseIcon from '@phosphor/x.svg';
import { authServiceClient } from '@service-auth/client';
import { contactsClient } from '@service-contacts/client';
import { Button, Dialog, Panel } from '@ui';
import { createSignal, Show } from 'solid-js';

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,\n\s]/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
}

const [inviteModalOpen, setInviteModalOpen] = createSignal(false);

/** Opens the invite modal. `source` is the UI surface, for analytics. */
export function openInviteModal(source: 'sidebar' | 'hotkey') {
  analytics.track('invite_modal_opened', { source });
  setInviteModalOpen(true);
}

export const InviteModal = () => {
  const analyticsClient = useAnalytics();
  const [value, setValue] = createSignal('');
  const [copied, setCopied] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  const referralCode = useReferralCode();

  const referralUrl = () => {
    const code = referralCode();
    if (!code) return undefined;
    return `${getWebOrigin()}/app/signup?referral_code=${code}`;
  };

  const handleCopy = () => {
    const url = referralUrl();
    if (!url) return;
    navigator.clipboard.writeText(url);
    analyticsClient.track('invite_link_copied');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    const emails = parseEmails(value());
    if (!emails.length) return;
    setSending(true);
    const failedEmails: string[] = [];
    for (const email of emails) {
      const result = await authServiceClient.sendReferralInvite(email);
      if (result.isOk()) {
        contactsClient.addContact(`macro|${email.toLowerCase()}`);
      } else {
        failedEmails.push(email);
      }
    }
    setSending(false);

    const sent = emails.length - failedEmails.length;
    analyticsClient.track('invite_sent', {
      sent,
      failed: failedEmails.length,
    });

    if (failedEmails.length) {
      // Keep the modal open with only the failed addresses so a retry
      // doesn't re-invite the ones that already went through.
      setValue(failedEmails.join('\n'));
      toast.failure(
        sent > 0
          ? `Sent ${sent} of ${emails.length} invites — the rest failed to send`
          : failedEmails.length === 1
            ? 'Failed to send the invite'
            : 'Failed to send the invites'
      );
      return;
    }

    setValue('');
    toast.success(
      sent === 1
        ? 'Invite sent successfully'
        : `${sent} invites sent successfully`
    );
    setInviteModalOpen(false);
  };

  const handleClose = () => {
    setValue('');
    setInviteModalOpen(false);
  };

  return (
    <Dialog open={inviteModalOpen()} onOpenChange={(o) => !o && handleClose()}>
      <Panel depth={2} class="max-h-[75vh] text-ink rounded-xl">
        <Panel.Header class="px-2 gap-1">
          <Dialog.CloseButton as={Button} variant="ghost" size="icon-sm">
            <CloseIcon />
          </Dialog.CloseButton>
          <Dialog.Title as="span" class="text-sm font-medium p-0 m-0">
            Invite
          </Dialog.Title>
        </Panel.Header>

        <Panel.Body scroll class="p-3 flex flex-col gap-3">
          <p>
            Invite friends and teammates to Macro. You'll get $100 in credits
            for each person who signs up.
          </p>
          <div class="flex flex-col gap-2">
            <textarea
              ref={(el) => {
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => el.focus())
                );
              }}
              placeholder={'name@company.com\ncolleague@company.com'}
              value={value()}
              onInput={(e) => setValue(e.currentTarget.value)}
              rows={4}
              class="w-full px-3 py-2 text-sm/relaxed border border-edge-muted rounded-lg bg-surface text-ink placeholder:text-ink/30 outline-none focus:border-accent resize-none"
            />
          </div>

          <div class="flex justify-end gap-1 pt-2">
            <Button variant="ghost" class="rounded-xs" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              variant={
                sending() || !parseEmails(value()).length ? 'ghost' : 'active'
              }
              disabled={sending() || !parseEmails(value()).length}
              class="rounded-xs font-semibold"
            >
              {sending() ? 'Sending…' : 'Send Invites'}
            </Button>
          </div>

          <Show when={referralUrl()}>
            {(url) => (
              <div class="flex flex-col gap-1.5 pt-3">
                <p class="text-xs text-ink/50">
                  Or share your personal referral link:
                </p>
                <div class="flex items-stretch gap-2">
                  <input
                    type="text"
                    readOnly
                    value={url()}
                    class="flex-1 px-3 py-1.5 text-xs border border-edge-muted rounded-xs bg-surface text-ink/70 outline-none select-all"
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <Button
                    type="button"
                    onClick={handleCopy}
                    size="md"
                    variant="base"
                    class="font-medium rounded-xs border px-2"
                  >
                    <ClipboardIcon class="size-3" />
                    {copied() ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}
          </Show>
        </Panel.Body>
      </Panel>
    </Dialog>
  );
};
