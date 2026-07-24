import { LoadingSpinner } from '@core/component/LoadingSpinner';
import { toast } from '@core/component/Toast/Toast';
import { useChannelsContext } from '@core/context/channels';
import CaretLeftIcon from '@phosphor/caret-left.svg';
import {
  useBotChannelsQuery,
  useBotQuery,
  useDeleteBotMutation,
  useUpdateBotMutation,
} from '@queries/bots/bots';
import { useSyncBotChannelsMutation } from '@queries/channel/channel-bots';
import type { BotWithAgent } from '@service-storage/client';
import { Button } from '@ui';
import { createEffect, createMemo, createSignal, on, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { agentBadgeLabel, agentModeLabel, BOT_EVENT_LABELS } from './agent';
import { BotAvatar } from './BotAvatar';
import { BotDeleteDialog } from './BotDeleteDialog';
import { BotDetailActions } from './BotDetailActions';
import { BotFormSection } from './BotFormSection';
import { BotProfileFields } from './BotProfileFields';
import { BotWebhooksSection } from './BotWebhooksSection';
import {
  type BotFormErrors,
  botToFormValues,
  EMPTY_BOT_FORM,
  slugBotHandle,
  validateBotForm,
} from './botForm';
import { ChannelMultiSelect } from './ChannelMultiSelect';
import { CreateBotTokenDialog } from './CreateBotTokenDialog';
import { createBotAvatarUpload } from './createBotAvatarUpload';

export function BotDetail(props: { botId: string; onBack: () => void }) {
  const channelsContext = useChannelsContext();
  const botQuery = useBotQuery(() => props.botId);
  const botChannelsQuery = useBotChannelsQuery(() => props.botId);
  const updateBotMutation = useUpdateBotMutation();
  const deleteBotMutation = useDeleteBotMutation();
  const syncChannelsMutation = useSyncBotChannelsMutation();
  const [initialized, setInitialized] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [tokenOpen, setTokenOpen] = createSignal(false);
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [errors, setErrors] = createSignal<BotFormErrors>({});
  const [channelIds, setChannelIds] = createSignal<string[]>([]);
  const [initialChannelIds, setInitialChannelIds] = createSignal<string[]>([]);
  const [initialForm, setInitialForm] = createSignal({ ...EMPTY_BOT_FORM });
  const [form, setForm] = createStore({ ...EMPTY_BOT_FORM });
  const avatarUpload = createBotAvatarUpload((url) =>
    setForm('avatarUrl', url)
  );

  createEffect(
    on(
      [() => botQuery.data, () => botChannelsQuery.data],
      ([bot, channels]) => {
        if (initialized() || !bot || channels === undefined) return;
        const nextForm = botToFormValues(bot);
        const nextChannelIds = channels.map((channel) => channel.channel_id);
        setForm(nextForm);
        setInitialForm(nextForm);
        setChannelIds(nextChannelIds);
        setInitialChannelIds(nextChannelIds);
        setInitialized(true);
      }
    )
  );

  // Read-only agent info (bot_type/agent aren't part of the generated Bot
  // schema yet, so widen instead of casting).
  const agentInfo = createMemo(() => {
    const bot: BotWithAgent | undefined = botQuery.data;
    if (!bot || bot.bot_type !== 'agent') return undefined;
    const events = bot.agent?.events ?? [];
    return {
      badge: agentBadgeLabel(bot),
      mode: agentModeLabel(bot.agent?.mode),
      isExternal: bot.agent?.mode === 'external',
      eventLabels:
        events.map((event) => BOT_EVENT_LABELS[event]).join(', ') ||
        BOT_EVENT_LABELS['channel.bot-mentioned'],
      webhookId: bot.agent?.webhook_id ?? undefined,
    };
  });

  const assignedChannels = createMemo(() => {
    const channelsById = channelsContext.channelsById();
    return (botChannelsQuery.data ?? []).map((channel) => ({
      id: channel.channel_id,
      name:
        channelsById[channel.channel_id]?.name?.trim() ||
        channel.name?.trim() ||
        'Unnamed channel',
    }));
  });
  const isDirty = createMemo(() => {
    const original = initialForm();
    const sameForm =
      form.name === original.name &&
      form.handle === original.handle &&
      form.description === original.description &&
      form.avatarUrl === original.avatarUrl;
    const originalChannels = [...initialChannelIds()].sort();
    const nextChannels = [...channelIds()].sort();
    return (
      !sameForm ||
      originalChannels.length !== nextChannels.length ||
      originalChannels.some((id, index) => id !== nextChannels[index])
    );
  });
  const pending = () =>
    saving() || avatarUpload.uploading() || deleteBotMutation.isPending;

  const leave = () => {
    if (pending()) return;
    props.onBack();
  };

  const save = async () => {
    // Agent settings are read-only here and the endpoint URL is never
    // returned by the API, so only the editable profile fields are validated.
    const parsed = validateBotForm({ ...form, botType: 'standard' });
    if (!parsed.success) {
      setErrors(parsed.errors);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const bot = await updateBotMutation.mutateAsync({
        botId: props.botId,
        name: parsed.data.name,
        handle: parsed.data.handle,
        description: parsed.data.description ?? '',
        avatarUrl: parsed.data.avatarUrl ?? '',
      });
      const channelResult = await syncChannelsMutation.mutateAsync({
        botId: props.botId,
        currentChannelIds: initialChannelIds(),
        nextChannelIds: channelIds(),
      });
      const nextForm = botToFormValues(bot);
      setForm(nextForm);
      setInitialForm(nextForm);
      if (channelResult.failedCount > 0) {
        const refreshed = await botChannelsQuery.refetch();
        const actualChannelIds =
          refreshed.data?.map((channel) => channel.channel_id) ??
          initialChannelIds();
        setChannelIds(actualChannelIds);
        setInitialChannelIds(actualChannelIds);
        toast.failure(
          `${channelResult.failedCount} channel change${channelResult.failedCount === 1 ? '' : 's'} could not be saved`
        );
      } else {
        setInitialChannelIds([...channelIds()]);
        toast.success('Bot updated');
      }
    } catch {
      toast.failure('Failed to update bot');
    } finally {
      setSaving(false);
    }
  };

  const deleteBot = async () => {
    try {
      await deleteBotMutation.mutateAsync({
        botId: props.botId,
        channelIds: (botChannelsQuery.data ?? []).map(
          (channel) => channel.channel_id
        ),
      });
      setDeleteOpen(false);
      toast.success('Bot deleted');
      props.onBack();
    } catch {
      toast.failure('Failed to delete bot');
    }
  };

  return (
    <>
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
          <Show
            when={initialized() && botQuery.data}
            fallback={
              <div class="flex min-h-96 items-center justify-center">
                <LoadingSpinner class="size-16 p-4" />
              </div>
            }
          >
            {(bot) => (
              <form
                class="flex flex-col gap-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <header class="flex items-center gap-3">
                  <BotAvatar
                    bot={{
                      name: form.name || bot().name,
                      avatar_url: form.avatarUrl || undefined,
                    }}
                    size="lg"
                  />
                  <div class="min-w-0">
                    <div class="flex min-w-0 items-center gap-2">
                      <h1 class="truncate text-lg font-semibold tracking-[-0.01em]">
                        {form.name || bot().name}
                      </h1>
                      <Show when={agentInfo()?.badge}>
                        {(badge) => (
                          <span class="shrink-0 rounded-md bg-accent-bg px-1.5 py-0.5 text-xs font-medium text-accent">
                            {badge()}
                          </span>
                        )}
                      </Show>
                    </div>
                    <p class="mt-0.5 truncate text-sm text-ink-muted">
                      @{form.handle || bot().handle}
                    </p>
                  </div>
                </header>

                <BotFormSection
                  class="mt-3"
                  title="Profile"
                  description="Update how this bot appears in channels and mentions."
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
                    }}
                    onHandleChange={(value) => {
                      setForm('handle', slugBotHandle(value));
                      setErrors((current) => ({
                        ...current,
                        handle: undefined,
                      }));
                    }}
                    onDescriptionChange={(value) =>
                      setForm('description', value)
                    }
                  />
                </BotFormSection>

                <Show when={agentInfo()}>
                  {(info) => (
                    <BotFormSection
                      title="Agent"
                      description="How this agent is triggered."
                    >
                      <dl class="flex flex-col gap-3">
                        <div class="flex items-baseline justify-between gap-3">
                          <dt class="text-xs font-medium text-ink-muted">
                            Mode
                          </dt>
                          <dd class="text-sm">{info().mode}</dd>
                        </div>
                        <div class="flex items-baseline justify-between gap-3">
                          <dt class="text-xs font-medium text-ink-muted">
                            Events
                          </dt>
                          <dd class="text-sm">{info().eventLabels}</dd>
                        </div>
                        <Show when={info().isExternal && info().webhookId}>
                          {(webhookId) => (
                            <div class="flex items-baseline justify-between gap-3">
                              <dt class="shrink-0 text-xs font-medium text-ink-muted">
                                Webhook ID
                              </dt>
                              <dd class="truncate font-mono text-xs">
                                {webhookId()}
                              </dd>
                            </div>
                          )}
                        </Show>
                      </dl>
                    </BotFormSection>
                  )}
                </Show>

                <BotFormSection
                  title="Channels"
                  description="Choose every channel this bot can post to."
                >
                  <ChannelMultiSelect
                    channelIds={channelIds()}
                    onChange={setChannelIds}
                    disabled={saving()}
                  />
                  <p class="mt-2 text-xs text-ink-muted">
                    Each assigned channel has a separate webhook URL.
                  </p>
                </BotFormSection>

                <BotWebhooksSection
                  channels={assignedChannels()}
                  onNewToken={() => setTokenOpen(true)}
                />

                <BotDetailActions
                  dirty={isDirty()}
                  pending={pending()}
                  saving={saving()}
                  onBack={leave}
                  onDelete={() => setDeleteOpen(true)}
                />
              </form>
            )}
          </Show>
        </main>
      </div>

      <CreateBotTokenDialog
        open={tokenOpen()}
        onOpenChange={setTokenOpen}
        bot={botQuery.data}
      />

      <BotDeleteDialog
        open={deleteOpen()}
        botName={botQuery.data?.name}
        pending={deleteBotMutation.isPending}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void deleteBot()}
      />
    </>
  );
}
