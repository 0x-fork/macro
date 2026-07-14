import { useSenderName } from '@components/app/app-sidebar/utils';
import { EntityIcon } from '@core/component/EntityIcon';
import { UserIcon } from '@core/component/UserIcon';
import { useUserId } from '@core/context/user';
import { compareDateDesc } from '@core/util/date';
import {
  Combobox,
  type ComboboxRootItemComponentProps,
} from '@kobalte/core/combobox';
import PlusIcon from '@phosphor/plus.svg';
import type { ApiChannelWithLatest } from '@service-storage/channel-list-types';
import { ChannelTypeEnum } from '@service-storage/client';
import { Surface } from '@ui';
import { createMemo, createSignal, Show } from 'solid-js';

type AddChannelOption = {
  id: string;
  /** Search/label text; DMs fall back to the recipient's email handle. */
  name: string;
  isDM: boolean;
  dmRecipientId?: string;
  unreadCount: number;
};

function dmFallbackName(userId: string | undefined) {
  if (userId?.startsWith('macro|')) return userId.slice(6).split('@')[0]!;
  return 'Direct message';
}

function OptionRow(props: ComboboxRootItemComponentProps<AddChannelOption>) {
  const option = () => props.item.rawValue;
  // Resolve the pretty display name for DMs; option.name stays the
  // deterministic fallback so filtering works before the fetch lands.
  const senderName = useSenderName(option().dmRecipientId);
  const label = () =>
    option().isDM ? (senderName() ?? option().name) : option().name;

  return (
    <Combobox.Item
      item={props.item}
      class="flex w-full cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink outline-none data-highlighted:bg-hover"
    >
      <Show
        when={option().isDM && option().dmRecipientId}
        fallback={
          <EntityIcon
            targetType="channel"
            size="xs"
            class="size-3.5 shrink-0"
          />
        }
      >
        {(recipientId) => (
          <UserIcon
            id={recipientId()}
            size="sm"
            suppressClick
            showTooltip={false}
          />
        )}
      </Show>
      <Combobox.ItemLabel class="ph-no-capture min-w-0 flex-1 truncate">
        {label()}
      </Combobox.ItemLabel>
      <Show when={option().unreadCount > 0}>
        <span class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-accent px-1.5 text-xs font-medium text-surface">
          {option().unreadCount}
        </span>
      </Show>
    </Combobox.Item>
  );
}

/**
 * Searchable picker for adding a channel tile to the dashboard. Options are
 * the channels without a tile, unread first then most recently active.
 */
export function AddChannelCombobox(props: {
  channels: ApiChannelWithLatest[];
  excludeIds: string[];
  unreadCounts: ReadonlyMap<string, number>;
  onAdd: (channelId: string) => void;
}) {
  const userId = useUserId();
  // Kobalte keeps the selected option as controlled state; reset it after
  // every pick so the same channel can be removed and re-added.
  const [selected, setSelected] = createSignal<AddChannelOption | null>(null);

  const options = createMemo<AddChannelOption[]>(() => {
    const excluded = new Set(props.excludeIds);
    return props.channels
      .filter((channel) => !excluded.has(channel.id))
      .sort((a, b) => {
        const aUnread = (props.unreadCounts.get(a.id) ?? 0) > 0 ? 1 : 0;
        const bUnread = (props.unreadCounts.get(b.id) ?? 0) > 0 ? 1 : 0;
        if (aUnread !== bUnread) return bUnread - aUnread;
        return compareDateDesc(
          a.latest_message?.created_at ?? a.updated_at,
          b.latest_message?.created_at ?? b.updated_at
        );
      })
      .map((channel) => {
        const isDM = channel.channel_type === ChannelTypeEnum.DirectMessage;
        const dmRecipientId = isDM
          ? channel.participants.find((p) => p.user_id !== userId())?.user_id
          : undefined;
        return {
          id: channel.id,
          name: isDM
            ? dmFallbackName(dmRecipientId)
            : channel.name?.trim() || 'New Channel',
          isDM,
          dmRecipientId,
          unreadCount: props.unreadCounts.get(channel.id) ?? 0,
        };
      });
  });

  return (
    <Combobox<AddChannelOption>
      options={options()}
      value={selected()}
      optionValue={(option) => option.id}
      optionLabel={(option) => option.name}
      optionTextValue={(option) => option.name}
      onChange={(option) => {
        if (!option) return;
        props.onAdd(option.id);
        setSelected(null);
      }}
      placeholder="Add channel"
      itemComponent={OptionRow}
      placement="bottom-end"
      allowsEmptyCollection
    >
      <Combobox.Control class="flex h-7 w-44 items-center gap-1.5 rounded-md border border-edge-muted px-2 focus-within:border-accent">
        <PlusIcon class="size-3.5 shrink-0 text-ink-muted" />
        <Combobox.Input class="ph-no-capture min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-placeholder" />
      </Combobox.Control>
      <Combobox.Portal>
        <Combobox.Content
          as={Surface}
          depth={3}
          class="z-action-menu mt-1 w-72 rounded-xl bg-menu p-1.5 shadow-menu"
        >
          <Show
            when={options().length > 0}
            fallback={
              <div class="px-2 py-5 text-center text-xs text-ink-muted">
                Every channel is already on the dashboard
              </div>
            }
          >
            <Combobox.Listbox class="max-h-72 overflow-y-auto" />
          </Show>
        </Combobox.Content>
      </Combobox.Portal>
    </Combobox>
  );
}
