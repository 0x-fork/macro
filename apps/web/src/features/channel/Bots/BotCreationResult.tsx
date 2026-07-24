import HashIcon from '@phosphor/hash.svg';
import CheckCircleIcon from '@phosphor-icons/core/assets/fill/check-circle-fill.svg?component-solid';
import type { AgentWebhook, BotWithAgent } from '@service-storage/client';
import { Button, Surface } from '@ui';
import { For, Show } from 'solid-js';
import { BotAvatar } from './BotAvatar';
import type { BotChannelOption } from './ChannelMultiSelect';
import { CredentialField } from './CredentialField';
import { channelWebhookUrl, webhookExample } from './webhook';

export function BotCreationResult(props: {
  bot: BotWithAgent;
  channels: BotChannelOption[];
  token?: string;
  tokenFailed: boolean;
  agentWebhook?: AgentWebhook;
  onDone: () => void;
}) {
  const isAgent = () => props.bot.bot_type === 'agent';
  const subtitle = () => {
    if (!isAgent()) {
      return 'Copy the credentials now. The token is shown only once.';
    }
    if (props.agentWebhook) {
      return 'Copy the credentials now. The signing secret is shown only once.';
    }
    return 'This bot replies when it is @-mentioned in a channel.';
  };

  return (
    <div>
      <header class="flex items-center gap-3">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-bg text-success">
          <CheckCircleIcon class="size-5" />
        </div>
        <div class="min-w-0">
          <h1 class="text-lg font-semibold tracking-[-0.01em]">Bot created</h1>
          <p class="mt-0.5 text-sm text-ink-muted">{subtitle()}</p>
        </div>
      </header>

      <Surface
        depth={2}
        class="mt-7 flex items-center gap-3 rounded-xl border border-ink/[0.06] p-4"
      >
        <BotAvatar bot={props.bot} size="lg" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium">{props.bot.name}</div>
          <div class="truncate text-xs text-ink-muted">@{props.bot.handle}</div>
        </div>
        <Show when={props.channels.length > 0}>
          <div class="flex max-w-64 flex-wrap justify-end gap-1">
            <For each={props.channels}>
              {(channel) => (
                <div class="flex min-w-0 items-center gap-1.5 rounded-md bg-ink/[0.04] px-2 py-1 text-xs text-ink-muted">
                  <HashIcon class="size-3.5 shrink-0" />
                  <span class="max-w-32 truncate">{channel.name}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Surface>

      <Show when={!isAgent()}>
        <div class="mt-7 flex flex-col gap-5">
          <For each={props.channels}>
            {(channel) => (
              <CredentialField
                label={`${channel.name} webhook URL`}
                value={channelWebhookUrl(channel.id)}
                help="Paste into GitHub or any webhook provider"
              />
            )}
          </For>

          <Show
            when={props.token}
            fallback={
              <div class="rounded-lg border border-alert/30 bg-alert-bg px-3 py-2.5 text-xs text-alert-ink">
                {props.tokenFailed
                  ? 'The bot was created, but its first token could not be generated. Use New token on the Bots settings page to retry.'
                  : 'No token was generated.'}
              </div>
            }
          >
            {(token) => (
              <>
                <CredentialField
                  label="Webhook token"
                  value={token()}
                  help="Send as x-macro-channel-bot-token"
                />
                <Show when={props.channels[0]}>
                  {(channel) => (
                    <CredentialField
                      label="Example request"
                      value={webhookExample(
                        channelWebhookUrl(channel().id),
                        token()
                      )}
                      help="Copy and run"
                    />
                  )}
                </Show>
              </>
            )}
          </Show>

          <Show when={props.channels.length === 0}>
            <div class="rounded-lg border border-edge-muted bg-ink/[0.025] px-3 py-2.5 text-xs text-ink-muted">
              Invite this bot to a channel to get its webhook URL. The token
              above will still work after it is invited.
            </div>
          </Show>
        </div>
      </Show>

      <Show when={isAgent()}>
        <div class="mt-7 flex flex-col gap-5">
          <Show
            when={props.agentWebhook}
            fallback={
              <div class="rounded-lg border border-edge-muted bg-ink/[0.025] px-3 py-2.5 text-xs text-ink-muted">
                The Macro agent replies as this bot when it is @-mentioned in a
                channel.
              </div>
            }
          >
            {(webhook) => (
              <>
                <CredentialField
                  label="Endpoint URL"
                  value={webhook().endpoint_url}
                  help="Where events are delivered"
                />
                <CredentialField
                  label="Signing secret"
                  value={webhook().signing_secret}
                  help="Verify X-Macro-Signature with this secret. Shown only once."
                />
                <Show when={!webhook().is_valid}>
                  <div class="rounded-lg border border-alert/30 bg-alert-bg px-3 py-2.5 text-xs text-alert-ink">
                    We couldn't validate your endpoint. Deliveries are paused
                    until the webhook is validated in settings.
                  </div>
                </Show>
              </>
            )}
          </Show>

          <Show when={props.channels.length === 0}>
            <div class="rounded-lg border border-edge-muted bg-ink/[0.025] px-3 py-2.5 text-xs text-ink-muted">
              Add this bot to a channel so it can be @-mentioned.
            </div>
          </Show>
        </div>
      </Show>

      <div class="mt-8 flex justify-end border-t border-edge-muted pt-4">
        <Button type="button" variant="cta" size="sm" onClick={props.onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
