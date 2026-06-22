import { toast } from '@core/component/Toast/Toast';
import { useChannelName } from '@core/context/channels';
import IconCaretDown from '@phosphor/caret-down.svg';
import IconPlus from '@phosphor/plus.svg';
import IconRobot from '@phosphor/robot.svg';
import { useBotsQuery } from '@queries/bots/bots';
import {
  useAddBotToChannelMutation,
  useChannelBotsQuery,
} from '@queries/channel/channel-bots';
import type { Bot } from '@service-storage/generated/schemas/bot';
import { Avatar, Dropdown } from '@ui';
import { For, Show } from 'solid-js';

function BotRowContent(props: { bot: Bot }) {
  return (
    <>
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
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-1">
          <span class="truncate text-sm text-ink">{props.bot.name}</span>
          <Show when={props.bot.handle}>
            {(handle) => (
              <span class="shrink-0 text-sm text-ink-extra-muted">
                @{handle()}
              </span>
            )}
          </Show>
        </div>
        <Show when={props.bot.description}>
          {(description) => (
            <div class="mt-0.5 truncate text-xs font-normal text-ink-muted">
              {description()}
            </div>
          )}
        </Show>
      </div>
    </>
  );
}

/**
 * Single "Add bot" dropdown: lists org bots not yet in the channel for one-click
 * add, plus a "Create new bot…" entry that opens the create dialog via
 * `onCreateNew`.
 */
export function AddBotMenu(props: {
  channelId: string;
  onCreateNew: () => void;
  triggerClass?: string;
}) {
  const botsQuery = useBotsQuery();
  const channelBotsQuery = useChannelBotsQuery(() => ({
    channelId: props.channelId,
  }));
  const channelName = useChannelName(props.channelId);
  const addBotToChannelMutation = useAddBotToChannelMutation();

  const channelBotIds = () =>
    new Set((channelBotsQuery.data ?? []).map((bot) => bot.id));

  const availableBots = (): Bot[] =>
    (botsQuery.data ?? []).filter((bot) => !channelBotIds().has(bot.id));

  const quickAddBot = (botId: string) => {
    addBotToChannelMutation.mutate(
      { channelId: props.channelId, botId },
      {
        onSuccess: () => {
          const name = channelName();
          toast.success(
            name ? `Bot added to ${name} channel` : 'Bot added to channel'
          );
        },
        onError: () => toast.failure('Failed to add bot'),
      }
    );
  };

  return (
    <Dropdown placement="bottom-end">
      <Dropdown.Trigger variant="cta" size="sm" class={props.triggerClass}>
        <IconPlus class="size-3.5" />
        Add bot
        <IconCaretDown class="size-2.5" />
      </Dropdown.Trigger>
      <Dropdown.Content class="min-w-56">
        <Show when={availableBots().length > 0}>
          <Dropdown.Group>
            <Dropdown.GroupLabel>Add existing</Dropdown.GroupLabel>
            <div class="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              <For each={availableBots()}>
                {(bot) => (
                  <Dropdown.Item
                    onSelect={() => quickAddBot(bot.id)}
                    class="h-auto py-2"
                  >
                    <div class="flex min-w-0 flex-1 items-center gap-3">
                      <BotRowContent bot={bot} />
                    </div>
                  </Dropdown.Item>
                )}
              </For>
            </div>
          </Dropdown.Group>
        </Show>
        <Dropdown.Group>
          <Dropdown.Item onSelect={() => props.onCreateNew()}>
            <IconPlus class="size-3.5 shrink-0 text-ink-muted" />
            <span class="flex-1 text-ink">Create new bot…</span>
          </Dropdown.Item>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
}
