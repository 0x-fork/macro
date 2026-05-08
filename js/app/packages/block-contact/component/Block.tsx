import { useSplitLayout } from '@app/component/split-layout/layout';
// import { convertContactInfoToEmailRecipient } from '@block-email/util/recipientConversion';
import { joinChannelCall } from '@channel/Call/join-channel-call';
import { useBlockId } from '@core/block';
import { toast } from '@core/component/Toast/Toast';
import { UserIcon } from '@core/component/UserIcon';
import { ENABLE_CALLS } from '@core/constant/featureFlags';
import { useUserId } from '@core/context/user';
import { emailToMacroId, useDisplayName } from '@core/user';
import { isOk } from '@core/util/maybeResult';
import WideCall from '@macro-icons/wide/call.svg';
import WideChat from '@macro-icons/wide/chat.svg';
// import WideEmail from '@macro-icons/wide/email.svg';
import { commsServiceClient } from '@service-comms/client';
import { Button } from '@ui';
import { Show } from 'solid-js';

export function ContactBlock() {
  // Block id is the email portion only (no `macro|` prefix); reconstruct the
  // full macro id for downstream APIs. Tolerate a legacy full-macro-id form
  // by stripping the prefix if present.
  const decoded = decodeURIComponent(useBlockId());
  const emailOrDomain = decoded.startsWith('macro|') ? decoded.slice(6) : decoded;
  const macroId = () => emailToMacroId(emailOrDomain);
  const fullId = () => macroId() ?? emailOrDomain;
  const email = () => emailOrDomain;
  const [displayName] = useDisplayName(macroId());
  const currentUserId = useUserId();
  const { openWithSplit } = useSplitLayout();

  const headerName = () => displayName() || email();

  const canMessage = () => !!macroId() && fullId() !== currentUserId();

  // const openCompose = (e: MouseEvent) => {
  //   e.preventDefault();
  //   e.stopPropagation();
  //   const recipient = convertContactInfoToEmailRecipient({
  //     email: email(),
  //     name: displayName() || undefined,
  //   });
  //   openWithSplit(
  //     {
  //       type: 'component',
  //       id: 'email-compose',
  //       params: { initialRecipients: [recipient] },
  //     },
  //     { preferNewSplit: e.shiftKey }
  //   );
  // };

  const openCall = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const result = await commsServiceClient.getOrCreateDirectMessage({
        recipient_id: fullId(),
      });
      const channelId = isOk(result) && result[1]?.channel_id;
      if (!channelId) {
        toast.failure('Failed to start call');
        return;
      }
      await joinChannelCall(channelId);
    } catch {
      toast.failure('Failed to start call');
    }
  };

  const openDM = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const result = await commsServiceClient.getOrCreateDirectMessage({
        recipient_id: fullId(),
      });
      const channelId = isOk(result) && result[1]?.channel_id;
      if (channelId) {
        openWithSplit(
          { type: 'channel', id: channelId },
          { preferNewSplit: e.shiftKey }
        );
      } else {
        toast.failure('Failed to open direct message');
      }
    } catch {
      toast.failure('Failed to open direct message');
    }
  };

  return (
    <div class="size-full bg-panel overflow-auto">
      <div class="max-w-2xl mx-auto p-6 flex flex-col gap-6">
        <header class="flex items-center gap-4">
          <div class="size-20 shrink-0">
            <UserIcon
              id={fullId()}
              size="fill"
              suppressClick
              showTooltip={false}
            />
          </div>
          <div class="flex flex-col min-w-0 gap-2">
            <div class="flex flex-col min-w-0">
              <div class="text-xl font-semibold truncate">{headerName()}</div>
              <Show when={displayName() && email() !== displayName()}>
                <div class="text-sm text-ink-muted truncate">{email()}</div>
              </Show>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              {/*
              <Button variant="base" size="md" onClick={openCompose}>
                <WideEmail class="size-3.5" /> Email
              </Button>
              */}
              <Show when={canMessage()}>
                <Button variant="base" size="md" onClick={openDM}>
                  <WideChat class="size-3.5" /> DM
                </Button>
              </Show>
              <Show when={canMessage() && ENABLE_CALLS()}>
                <Button variant="base" size="md" onClick={openCall}>
                  <WideCall class="size-3.5" /> Call
                </Button>
              </Show>
            </div>
          </div>
        </header>

        <section class="flex flex-col gap-2">
          <div class="text-xs uppercase tracking-wide text-ink-muted">
            Properties
          </div>
          <dl class="rounded border border-edge-muted divide-y divide-edge-muted text-sm">
            <div class="flex items-center gap-3 p-3">
              <dt class="w-24 shrink-0 text-ink-muted">Email</dt>
              <dd class="truncate">{email()}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
