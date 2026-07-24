import { LoadingSpinner } from '@core/component/LoadingSpinner';
import { toast } from '@core/component/Toast/Toast';
import { useChannelsContext } from '@core/context/channels';
import CaretLeftIcon from '@phosphor/caret-left.svg';
import RobotIcon from '@phosphor/robot.svg';
import {
  useCreateBotMutation,
  useCreateBotTokenMutation,
} from '@queries/bots/bots';
import {
  useAddBotToChannelsMutation,
  useCreateChannelScopedBotMutation,
} from '@queries/channel/channel-bots';
import {
  type AgentWebhook,
  type BotWithAgent,
  ChannelTypeEnum,
} from '@service-storage/client';
import { Button } from '@ui';
import { createMemo, createSignal, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { BOT_EVENT_LABELS } from './agent';
import { BotCreationResult } from './BotCreationResult';
import { BotFormSection } from './BotFormSection';
import { BotProfileFields } from './BotProfileFields';
import {
  type BotFormErrors,
  type BotFormValues,
  EMPTY_BOT_FORM,
  slugBotHandle,
  validateBotForm,
} from './botForm';
import { ChannelMultiSelect } from './ChannelMultiSelect';
import { createBotAvatarUpload } from './createBotAvatarUpload';

type Stage = 'form' | 'creating' | 'ready';

function ChoiceOption(props: {
  name: string;
  title: string;
  subtitle: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      class="flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-accent"
      classList={{
        'border-accent bg-accent-bg/50': props.checked,
        'border-edge-muted hover:bg-hover': !props.checked,
      }}
    >
      <input
        type="radio"
        name={props.name}
        checked={props.checked}
        onChange={props.onSelect}
        class="sr-only"
      />
      <span class="text-sm font-medium">{props.title}</span>
      <span class="text-xs text-ink-muted">{props.subtitle}</span>
    </label>
  );
}

export function BotCreate(props: { channelId?: string; onBack: () => void }) {
  const channelsContext = useChannelsContext();
  const createBotMutation = useCreateBotMutation();
  const createTokenMutation = useCreateBotTokenMutation();
  const createScopedBotMutation = useCreateChannelScopedBotMutation();
  const addBotToChannelsMutation = useAddBotToChannelsMutation();
  const [stage, setStage] = createSignal<Stage>('form');
  const [handleEdited, setHandleEdited] = createSignal(false);
  const [errors, setErrors] = createSignal<BotFormErrors>({});
  const [createdBot, setCreatedBot] = createSignal<BotWithAgent>();
  const [createdChannelIds, setCreatedChannelIds] = createSignal<string[]>([]);
  const [rawToken, setRawToken] = createSignal<string>();
  const [tokenFailed, setTokenFailed] = createSignal(false);
  const [agentWebhook, setAgentWebhook] = createSignal<AgentWebhook>();
  const [selectedChannelIds, setSelectedChannelIds] = createSignal<string[]>(
    props.channelId ? [props.channelId] : []
  );
  const [form, setForm] = createStore({ ...EMPTY_BOT_FORM });
  const avatarUpload = createBotAvatarUpload((url) =>
    setForm('avatarUrl', url)
  );

  const channelOptions = createMemo(() =>
    channelsContext
      .channels()
      .filter((channel) => channel.channel_type === ChannelTypeEnum.Private)
      .map((channel) => ({
        id: channel.id,
        name: channel.name?.trim() || 'Unnamed channel',
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
  const resultChannels = createMemo(() => {
    const selected = new Set(createdChannelIds());
    return channelOptions().filter((channel) => selected.has(channel.id));
  });
  const pending = () => stage() === 'creating' || avatarUpload.uploading();

  const leave = () => {
    if (pending()) return;
    props.onBack();
  };

  const finish = (bot: BotWithAgent, token?: string) => {
    setCreatedBot(bot);
    setRawToken(token);
    setStage('ready');
  };

  // Agent bots always use the plain create endpoint — channel-scoped creation
  // stays standard-only. Selected channels are joined afterwards so the agent
  // can be @-mentioned in them.
  const createAgentBot = (values: BotFormValues, channelIds: string[]) => {
    createBotMutation.mutate(
      {
        name: values.name,
        handle: values.handle,
        description: values.description || undefined,
        avatarUrl: values.avatarUrl || undefined,
        agent: {
          mode: values.agentMode,
          events: values.agentEvents,
          ...(values.agentMode === 'external'
            ? { webhook_url: values.webhookUrl }
            : {}),
        },
      },
      {
        onSuccess: async ({ bot, agent_webhook }) => {
          setAgentWebhook(agent_webhook ?? undefined);
          if (channelIds.length > 0) {
            const result = await addBotToChannelsMutation.mutateAsync({
              botId: bot.id,
              channelIds,
            });
            setCreatedChannelIds(result.addedChannelIds);
            if (result.failedCount > 0) {
              toast.failure(
                `${result.failedCount} channel assignment${result.failedCount === 1 ? '' : 's'} could not be completed`
              );
            }
          }
          // Agents don't get a webhook token — tokens are for inbound
          // channel webhook posting.
          finish(bot);
        },
        onError: () => {
          setStage('form');
          toast.failure('Failed to create bot');
        },
      }
    );
  };

  const submit = () => {
    const parsed = validateBotForm({
      ...form,
      handle: form.handle || slugBotHandle(form.name),
    });
    if (!parsed.success) {
      setErrors(parsed.errors);
      return;
    }

    const values = parsed.data;
    const channelIds = selectedChannelIds();
    const [firstChannelId, ...remainingChannelIds] = channelIds;
    setErrors({});
    setCreatedChannelIds(channelIds);
    setStage('creating');

    if (values.botType === 'agent') {
      createAgentBot(values, channelIds);
      return;
    }

    if (firstChannelId) {
      createScopedBotMutation.mutate(
        {
          channelId: firstChannelId,
          name: values.name,
          handle: values.handle,
          description: values.description || undefined,
          avatar_url: values.avatarUrl || undefined,
          token_label: 'webhook',
        },
        {
          onSuccess: async ({ bot, bot_token }) => {
            if (remainingChannelIds.length > 0) {
              const result = await addBotToChannelsMutation.mutateAsync({
                botId: bot.id,
                channelIds: remainingChannelIds,
              });
              setCreatedChannelIds([firstChannelId, ...result.addedChannelIds]);
              if (result.failedCount > 0) {
                toast.failure(
                  `${result.failedCount} channel assignment${result.failedCount === 1 ? '' : 's'} could not be completed`
                );
              }
            }
            finish(bot, bot_token);
          },
          onError: () => {
            setStage('form');
            toast.failure('Failed to create bot');
          },
        }
      );
      return;
    }

    createBotMutation.mutate(
      {
        name: values.name,
        handle: values.handle,
        description: values.description || undefined,
        avatarUrl: values.avatarUrl || undefined,
      },
      {
        onSuccess: ({ bot }) => {
          setCreatedBot(bot);
          createTokenMutation.mutate(
            { botId: bot.id, label: 'webhook' },
            {
              onSuccess: ({ bearer_token }) => finish(bot, bearer_token),
              onError: () => {
                setTokenFailed(true);
                finish(bot);
              },
            }
          );
        },
        onError: () => {
          setStage('form');
          toast.failure('Failed to create bot');
        },
      }
    );
  };

  return (
    <div class="size-full overflow-y-auto bg-surface text-ink">
      <main class="mx-auto w-full max-w-[560px] px-8 pt-14 pb-24 mobile:px-5 mobile:pt-8 mobile:pb-12">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="-ml-2 mb-7"
          disabled={pending()}
          onClick={leave}
        >
          <CaretLeftIcon />
          Back to bots
        </Button>
        <Show when={stage() !== 'ready'}>
          <header class="flex items-center gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-edge-muted bg-ink/[0.025] text-ink-muted">
              <RobotIcon class="size-5" />
            </div>
            <div class="min-w-0">
              <h1 class="text-lg font-semibold tracking-[-0.01em]">
                Create a bot
              </h1>
              <p class="mt-0.5 text-sm text-ink-muted">
                Give an integration a profile and a secure channel webhook.
              </p>
            </div>
          </header>
        </Show>

        <Show when={stage() === 'form'}>
          <form
            class="mt-8 flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <BotFormSection
              title="Profile"
              description="This is how the bot appears in channels and mentions."
            >
              <BotProfileFields
                value={form}
                errors={errors()}
                uploadingAvatar={avatarUpload.uploading()}
                onUploadAvatar={avatarUpload.open}
                onNameChange={(value) => {
                  setForm('name', value);
                  setErrors((current) => ({
                    ...current,
                    name: undefined,
                  }));
                  if (!handleEdited()) {
                    setForm('handle', slugBotHandle(value));
                  }
                }}
                onHandleChange={(value) => {
                  setHandleEdited(true);
                  setForm('handle', slugBotHandle(value));
                  setErrors((current) => ({
                    ...current,
                    handle: undefined,
                  }));
                }}
                onDescriptionChange={(value) => setForm('description', value)}
              />
            </BotFormSection>

            <BotFormSection
              title="Type"
              description="Choose how this bot does its work."
            >
              <div
                role="radiogroup"
                aria-label="Bot type"
                class="grid grid-cols-2 gap-3 mobile:grid-cols-1"
              >
                <ChoiceOption
                  name="bot-type"
                  title="Standard"
                  subtitle="Post messages into channels through webhook URLs."
                  checked={form.botType === 'standard'}
                  onSelect={() => setForm('botType', 'standard')}
                />
                <ChoiceOption
                  name="bot-type"
                  title="Agent"
                  subtitle="Responds to events, like being @-mentioned."
                  checked={form.botType === 'agent'}
                  onSelect={() => setForm('botType', 'agent')}
                />
              </div>

              <Show when={form.botType === 'agent'}>
                <div class="mt-4 border-t border-edge-muted pt-4">
                  <span class="mb-1.5 block text-xs font-medium">Mode</span>
                  <div
                    role="radiogroup"
                    aria-label="Agent mode"
                    class="grid grid-cols-2 gap-3 mobile:grid-cols-1"
                  >
                    <ChoiceOption
                      name="agent-mode"
                      title="Macro agent"
                      subtitle="The built-in Macro assistant replies as this bot."
                      checked={form.agentMode === 'macro'}
                      onSelect={() => {
                        setForm('agentMode', 'macro');
                        setErrors((current) => ({
                          ...current,
                          webhookUrl: undefined,
                        }));
                      }}
                    />
                    <ChoiceOption
                      name="agent-mode"
                      title="External"
                      subtitle="Events are delivered to your webhook endpoint."
                      checked={form.agentMode === 'external'}
                      onSelect={() => setForm('agentMode', 'external')}
                    />
                  </div>

                  <div class="mt-4">
                    <span class="mb-1.5 block text-xs font-medium">Events</span>
                    <label class="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked
                        disabled
                        class="mt-0.5 accent-accent"
                        aria-label={BOT_EVENT_LABELS['channel.bot-mentioned']}
                      />
                      <span class="min-w-0">
                        <span class="block text-sm">
                          {BOT_EVENT_LABELS['channel.bot-mentioned']}
                        </span>
                        <span class="block text-xs text-ink-muted">
                          Triggered when the bot is @-mentioned in a channel.
                        </span>
                      </span>
                    </label>
                  </div>

                  <Show when={form.agentMode === 'external'}>
                    <label class="mt-4 flex flex-col gap-1.5">
                      <span class="text-xs font-medium">
                        Webhook endpoint URL
                      </span>
                      <input
                        value={form.webhookUrl}
                        placeholder="https://example.com/macro/events"
                        class="settings-input w-full"
                        aria-invalid={!!errors().webhookUrl}
                        onInput={(event) => {
                          setForm('webhookUrl', event.currentTarget.value);
                          setErrors((current) => ({
                            ...current,
                            webhookUrl: undefined,
                          }));
                        }}
                      />
                      <Show when={errors().webhookUrl}>
                        {(error) => (
                          <span class="text-xs text-failure">{error()}</span>
                        )}
                      </Show>
                    </label>
                  </Show>
                </div>
              </Show>
            </BotFormSection>

            <BotFormSection
              title="Channels"
              description={
                form.botType === 'agent'
                  ? 'Agents must be in a channel to be @-mentioned.'
                  : 'Add the bot now to get ready-to-use webhook URLs.'
              }
            >
              <label class="mb-1.5 block text-xs font-medium">
                Add to channels <span class="text-ink-muted">· optional</span>
              </label>
              <ChannelMultiSelect
                channelIds={selectedChannelIds()}
                onChange={setSelectedChannelIds}
              />
              <p class="mt-2 text-xs text-ink-muted">
                {form.botType === 'agent'
                  ? 'You can change these assignments later.'
                  : 'Each selected channel gets its own webhook URL. You can change these assignments later.'}
              </p>
            </BotFormSection>

            <div class="flex items-center justify-between gap-4 pt-1">
              <p class="text-xs text-ink-muted">
                {form.botType === 'agent'
                  ? form.agentMode === 'external'
                    ? 'A signed event webhook is provisioned automatically.'
                    : 'The Macro agent replies as this bot when mentioned.'
                  : 'A webhook token is generated automatically.'}
              </p>
              <div class="flex shrink-0 gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={leave}>
                  Cancel
                </Button>
                <Button type="submit" variant="cta" size="sm">
                  Create bot
                </Button>
              </div>
            </div>
          </form>
        </Show>

        <Show when={stage() === 'creating'}>
          <div class="flex min-h-96 flex-col items-center justify-center gap-4 text-center">
            <LoadingSpinner class="size-16 p-4" />
            <div>
              <div class="text-sm font-medium">Creating your bot…</div>
              <div class="mt-1 text-xs text-ink-muted">
                {form.botType === 'agent'
                  ? 'Setting up its profile, channels, and event subscriptions.'
                  : 'Setting up its profile, channels, and webhook token.'}
              </div>
            </div>
          </div>
        </Show>

        <Show when={stage() === 'ready' && createdBot()}>
          {(bot) => (
            <BotCreationResult
              bot={bot()}
              channels={resultChannels()}
              token={rawToken()}
              tokenFailed={tokenFailed()}
              agentWebhook={agentWebhook()}
              onDone={leave}
            />
          )}
        </Show>
      </main>
    </div>
  );
}
