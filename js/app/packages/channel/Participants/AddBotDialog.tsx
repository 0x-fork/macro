import { LoadingSpinner } from '@core/component/LoadingSpinner';
import { toast } from '@core/component/Toast/Toast';
import { staticFileIdEndpoint } from '@core/constant/servers';
import { openFilePicker, uploadFile } from '@core/util/upload';
import IconCheck from '@phosphor/check.svg';
import IconCopy from '@phosphor/copy.svg';
import IconRobot from '@phosphor/robot.svg';
import IconUpload from '@phosphor/upload-simple.svg';
import IconX from '@phosphor/x.svg';
import IconCheckCircle from '@phosphor-icons/core/assets/fill/check-circle-fill.svg?component-solid';
import { useCreateBotWithTokenMutation } from '@queries/bots/bots';
import type { Bot } from '@service-storage/generated/schemas/bot';
import { Avatar, Button, cn, Dialog, Panel } from '@ui';
import { Stepper } from '@ui/components/Stepper';
import { createSignal, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { z } from 'zod';

const createBotSchema = z.object({
  name: z.string().trim().min(1, 'Enter a bot name.').max(128),
  handle: z
    .string()
    .trim()
    .min(1, 'Enter a mention handle.')
    .max(64, 'Mention handle must be 64 characters or fewer.')
    .regex(/^[a-z0-9_-]+$/, "Use lowercase letters, numbers, '-' or '_' only."),
  description: z.string().trim().max(500).optional(),
  avatarUrl: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || URL.canParse(value), 'Choose a valid image.'),
});

type CreateBotFormErrors = Partial<
  Record<keyof z.infer<typeof createBotSchema>, string>
>;

function BotAvatarPreview(props: {
  name: string;
  avatarUrl?: string;
  size?: 'md' | 'lg';
}) {
  return (
    <Avatar size={props.size ?? 'md'}>
      <Show
        when={props.avatarUrl}
        fallback={
          <Avatar.Fallback>
            <IconUpload class="size-4" />
          </Avatar.Fallback>
        }
      >
        {(avatarUrl) => <Avatar.Image src={avatarUrl()} alt={props.name} />}
      </Show>
    </Avatar>
  );
}

function CreatedBotPreview(props: { bot: Bot }) {
  return (
    <div class="flex min-w-0 items-center gap-3 rounded-lg border border-edge-muted bg-surface px-3 py-2">
      <Avatar size="md">
        <Show
          when={props.bot.avatar_url}
          fallback={
            <Avatar.Fallback>
              <IconRobot class="size-4" />
            </Avatar.Fallback>
          }
        >
          {(avatarUrl) => (
            <Avatar.Image src={avatarUrl()} alt={props.bot.name} />
          )}
        </Show>
      </Avatar>
      <div class="min-w-0 flex-1 text-left">
        <div class="truncate text-base font-medium text-ink">
          {props.bot.name}
        </div>
        <Show when={props.bot.handle}>
          {(handle) => (
            <div class="truncate text-sm text-ink-extra-muted">@{handle()}</div>
          )}
        </Show>
      </div>
    </div>
  );
}

export function AddBotDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (bot: Bot) => void;
}) {
  const createBotWithTokenMutation = useCreateBotWithTokenMutation();

  const [step, setStep] = createSignal(0);
  const [handleEdited, setHandleEdited] = createSignal(false);
  const [errors, setErrors] = createSignal<CreateBotFormErrors>({});

  const [token, setToken] = createSignal<string | undefined>(undefined);
  const [tokenCopied, setTokenCopied] = createSignal(false);
  const [createdBot, setCreatedBot] = createSignal<Bot | undefined>(undefined);

  const [botCreation, setBotCreation] = createStore({
    name: '',
    handle: '',
    description: '',
    avatarUrl: '',
  });

  const reset = () => {
    setStep(0);
    setHandleEdited(false);
    setErrors({});
    setToken(undefined);
    setTokenCopied(false);
    setCreatedBot(undefined);
    setBotCreation({
      name: '',
      handle: '',
      description: '',
      avatarUrl: '',
    });
  };

  const close = () => {
    props.onOpenChange(false);
    reset();
  };

  const slugHandle = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);

  const createBot = () => {
    const parsed = createBotSchema.safeParse({
      name: botCreation.name,
      handle: botCreation.handle.trim() || slugHandle(botCreation.name),
      description: botCreation.description,
      avatarUrl: botCreation.avatarUrl,
    });

    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path[0], issue.message])
        ) as CreateBotFormErrors
      );
      return;
    }

    setErrors({});
    setStep(1);
    createBotWithTokenMutation.mutate(
      {
        avatarUrl: parsed.data.avatarUrl || undefined,
        description: parsed.data.description || undefined,
        handle: parsed.data.handle,
        name: parsed.data.name,
        tokenLabel: 'webhook',
      },
      {
        onSuccess: ({ bot, bot_token }) => {
          setToken(bot_token);
          setCreatedBot(bot);
          props.onCreated(bot);
          setStep(2);
        },
        onError: () => {
          setStep(0);
          toast.failure('Failed to create bot');
        },
      }
    );
  };

  const copyCreatedBotToken = async () => {
    const currentToken = token();
    if (!currentToken) return;

    try {
      await navigator.clipboard.writeText(currentToken);
      setTokenCopied(true);
      window.setTimeout(() => setTokenCopied(false), 1500);
    } catch {
      toast.failure('Failed to copy token');
    }
  };

  const uploadAvatar = () => {
    openFilePicker(
      { acceptedMimeTypes: ['image/*'], multiple: false },
      async ([file]) => {
        if (!file) return;
        const result = await uploadFile(file, 'static');
        if (result.failed || result.destination !== 'static') {
          toast.failure('Failed to upload avatar');
          return;
        }
        setBotCreation('avatarUrl', staticFileIdEndpoint(result.id));
        setErrors((current) => ({ ...current, avatarUrl: undefined }));
      }
    );
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (open) props.onOpenChange(true);
        else close();
      }}
    >
      <Panel depth={2} active class="text-ink rounded-xl">
        <Panel.Header class="border-b-0 px-3 gap-2">
          <Dialog.Title
            as="span"
            class={cn('text-sm font-medium p-0 m-0', step() > 0 && 'sr-only')}
          >
            Create bot
          </Dialog.Title>
          <Dialog.CloseButton
            as={Button}
            class="ml-auto"
            variant="ghost"
            size="icon-sm"
          >
            <IconX />
          </Dialog.CloseButton>
        </Panel.Header>
        <Panel.Body class="p-4">
          <Stepper step={step()} transition={Stepper.transitions.scale}>
            <Stepper.Step>
              <form
                class="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  createBot();
                }}
              >
                <div class="flex flex-col gap-4">
                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      class="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      onClick={uploadAvatar}
                    >
                      <BotAvatarPreview
                        name={botCreation.name || 'Bot'}
                        avatarUrl={botCreation.avatarUrl || undefined}
                        size="lg"
                      />
                    </button>
                    <div class="text-sm text-ink-muted">
                      <Show
                        when={botCreation.avatarUrl}
                        fallback="Upload an avatar"
                      >
                        Change avatar
                      </Show>
                    </div>
                  </div>
                  <Show when={errors().avatarUrl}>
                    {(error) => (
                      <span class="text-xs text-failure">{error()}</span>
                    )}
                  </Show>
                  <div class="grid grid-cols-2 gap-3">
                    <label class="flex flex-col gap-1.5 text-sm">
                      <span class="font-medium text-ink">Bot name</span>
                      <input
                        value={botCreation.name}
                        placeholder="Support bot"
                        aria-invalid={!!errors().name}
                        class="w-full rounded-lg border border-edge-muted bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink/30 outline-none focus:border-accent aria-invalid:border-failure disabled:opacity-50"
                        onInput={(event) => {
                          const value = event.currentTarget.value;
                          setBotCreation('name', value);
                          setErrors((current) => ({
                            ...current,
                            name: undefined,
                          }));
                          if (!handleEdited()) {
                            setBotCreation('handle', slugHandle(value));
                          }
                        }}
                      />
                      <Show when={errors().name}>
                        {(error) => (
                          <span class="text-xs text-failure">{error()}</span>
                        )}
                      </Show>
                    </label>
                    <label class="flex flex-col gap-1.5 text-sm">
                      <span class="font-medium text-ink">Mention handle</span>
                      <input
                        value={botCreation.handle}
                        placeholder="e.g. support"
                        aria-invalid={!!errors().handle}
                        class="w-full rounded-lg border border-edge-muted bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink/30 outline-none focus:border-accent aria-invalid:border-failure disabled:opacity-50"
                        onInput={(event) => {
                          setHandleEdited(true);
                          setBotCreation(
                            'handle',
                            slugHandle(event.currentTarget.value)
                          );
                          setErrors((current) => ({
                            ...current,
                            handle: undefined,
                          }));
                        }}
                      />
                      <Show when={errors().handle}>
                        {(error) => (
                          <span class="text-xs text-failure">{error()}</span>
                        )}
                      </Show>
                    </label>
                  </div>
                  <label class="flex flex-col gap-1.5 text-sm">
                    <span class="font-medium text-ink">Description</span>
                    <textarea
                      value={botCreation.description}
                      placeholder="Posts updates to the channel"
                      rows={2}
                      aria-invalid={!!errors().description}
                      class="w-full resize-none rounded-lg border border-edge-muted bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink/30 outline-none focus:border-accent aria-invalid:border-failure disabled:opacity-50"
                      onInput={(event) => {
                        setBotCreation(
                          'description',
                          event.currentTarget.value
                        );
                        setErrors((current) => ({
                          ...current,
                          description: undefined,
                        }));
                      }}
                    />
                    <Show when={errors().description}>
                      {(error) => (
                        <span class="text-xs text-failure">{error()}</span>
                      )}
                    </Show>
                  </label>
                </div>
                <div class="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="cta">
                    Create bot
                  </Button>
                </div>
              </form>
            </Stepper.Step>
            <Stepper.Step>
              <div class="min-h-48 flex flex-col gap-4 items-center justify-center text-center">
                <LoadingSpinner class="size-24 p-6" />
                <div>
                  <div class="text-sm font-medium text-ink">Creating bot…</div>
                  <div class="mt-1 text-sm text-ink-muted">
                    Generating a webhook token.
                  </div>
                </div>
              </div>
            </Stepper.Step>
            <Stepper.Step>
              <Show when={token()}>
                {(token) => (
                  <div class="flex flex-col gap-12">
                    <div class="flex flex-col items-center gap-4">
                      <div class="flex items-center justify-center gap-2 text-2xl font-semibold text-ink">
                        <IconCheckCircle class="size-8 text-success" />
                        Bot created
                      </div>
                      <Show when={createdBot()}>
                        {(bot) => (
                          <div class="w-full max-w-lg">
                            <CreatedBotPreview bot={bot()} />
                          </div>
                        )}
                      </Show>
                    </div>
                    <label class="flex flex-col gap-1.5 text-sm items-center self-center max-w-lg">
                      <span class="font-medium self-start text-ink">
                        Webhook token
                      </span>
                      <span class="self-start text-sm text-ink-muted">
                        Use this token to authenticate webhook requests that
                        post messages to channels as this bot.
                      </span>
                      <div class="w-full flex items-center gap-2 rounded-lg border border-edge-muted bg-surface px-3 py-2">
                        <input
                          readOnly
                          value={token()}
                          class="min-w-0 flex-1 bg-transparent font-mono text-xs text-ink outline-none"
                          onClick={(event) => event.currentTarget.select()}
                        />
                        <Button
                          type="button"
                          variant={tokenCopied() ? 'success' : 'ghost'}
                          size={tokenCopied() ? 'sm' : 'icon-sm'}
                          label="Copy token"
                          onClick={copyCreatedBotToken}
                        >
                          <Show when={tokenCopied()} fallback={<IconCopy />}>
                            <IconCheck />
                            Copied
                          </Show>
                        </Button>
                      </div>
                      <div class="text-sm text-alert-ink">
                        This token is only shown once. If you lose it, create a
                        new token for the bot.
                      </div>
                    </label>
                    <div class="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="cta" onClick={close}>
                        <IconCheck class="size-4" />
                        Done
                      </Button>
                    </div>
                  </div>
                )}
              </Show>
            </Stepper.Step>
          </Stepper>
        </Panel.Body>
      </Panel>
    </Dialog>
  );
}
