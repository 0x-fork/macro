import { useListLayout } from '@entity';
import FolderSimpleIcon from '@phosphor/folder-simple.svg';
import FlagIcon from '@phosphor/flag.svg';
import UserIcon from '@phosphor/user.svg';
import ClockIcon from '@phosphor/clock.svg';
import HashIcon from '@phosphor/hash.svg';
import ChatIcon from '@phosphor/chat-centered.svg';
import EnvelopeIcon from '@phosphor/envelope.svg';
import TextIcon from '@phosphor/text-aa.svg';
import { Match, Show, Switch } from 'solid-js';

type ListHeaderType = 'task' | 'email' | 'channel' | 'document' | 'inbox' | 'default';

interface ListHeaderProps {
  type?: ListHeaderType;
  timestampLabel?: string;
}

const HeaderDivider = () => (
  <span class="w-px h-3 bg-ink/20" />
);

export function ListHeader(props: ListHeaderProps) {
  const isWide = useListLayout()?.isWide ?? (() => true);
  const type = () => props.type ?? 'default';
  const timestampLabel = () => props.timestampLabel ?? 'Updated';

  return (
    <Show when={isWide()}>
      <Switch>
        <Match when={type() === 'task'}>
          <div
            class="grid items-center gap-x-2 min-w-0 w-full px-2 py-1.5 text-xs text-ink-extra-muted/50"
            style={{ 'grid-template-columns': '1rem minmax(0, 1fr) minmax(0, 8rem) 5.5rem 7.5rem 4.5rem' }}
          >
            <span />
            <span class="flex items-center gap-1 -ml-3"><TextIcon class="size-3" />Title</span>
            <span class="flex items-center gap-1"><HeaderDivider /><FolderSimpleIcon class="size-3" />Folder</span>
            <span class="flex items-center gap-1"><HeaderDivider /><FlagIcon class="size-3" />Priority</span>
            <span class="flex items-center gap-1"><HeaderDivider /><UserIcon class="size-3" />Assignee</span>
            <span class="flex items-center gap-1"><HeaderDivider /><ClockIcon class="size-3" />{timestampLabel()}</span>
          </div>
        </Match>
        <Match when={type() === 'email'}>
          <div
            class="grid items-center gap-x-2 min-w-0 w-full px-2 py-1.5 text-xs text-ink-extra-muted/50"
            style={{ 'grid-template-columns': 'auto minmax(0, 1fr) 21rem 4.5rem' }}
          >
            <span />
            <span class="flex items-center gap-1 -ml-3"><UserIcon class="size-3" />From<span class="mx-1">—</span><EnvelopeIcon class="size-3" />Subject</span>
            <span />
            <span class="flex items-center gap-1"><HeaderDivider /><ClockIcon class="size-3" />{timestampLabel()}</span>
          </div>
        </Match>
        <Match when={type() === 'channel'}>
          <div
            class="grid items-center gap-x-2 min-w-0 w-full px-2 py-1.5 text-xs text-ink-extra-muted/50"
            style={{ 'grid-template-columns': 'auto 12rem minmax(0, 1fr) 21rem 4.5rem' }}
          >
            <span />
            <span class="flex items-center gap-1 -ml-3"><HashIcon class="size-3" />Channel</span>
            <span class="flex items-center gap-1"><HeaderDivider /><ChatIcon class="size-3" />Message</span>
            <span />
            <span class="flex items-center gap-1"><HeaderDivider /><ClockIcon class="size-3" />{timestampLabel()}</span>
          </div>
        </Match>
        <Match when={type() === 'document'}>
          <div
            class="grid items-center gap-x-2 min-w-0 w-full px-2 py-1.5 text-xs text-ink-extra-muted/50"
            style={{ 'grid-template-columns': '1.5rem minmax(0, 1fr) auto auto' }}
          >
            <span />
            <span class="flex items-center gap-1 -ml-3"><TextIcon class="size-3" />Title</span>
            <span class="flex items-center gap-1"><HeaderDivider /><FolderSimpleIcon class="size-3" />Folder</span>
            <span class="flex items-center gap-1"><HeaderDivider /><ClockIcon class="size-3" />{timestampLabel()}</span>
          </div>
        </Match>
        <Match when={type() === 'inbox'}>
          <div
            class="grid items-center gap-x-2 min-w-0 w-full px-2 py-1.5 text-xs text-ink-extra-muted/50"
            style={{ 'grid-template-columns': '1rem minmax(0, 1fr) minmax(0, 8rem) 5.5rem 7.5rem 4.5rem' }}
          >
            <span />
            <span class="flex items-center gap-1 -ml-3"><TextIcon class="size-3" />Title</span>
            <span class="flex items-center gap-1"><HeaderDivider /><FolderSimpleIcon class="size-3" />Folder</span>
            <span class="flex items-center gap-1"><HeaderDivider /><FlagIcon class="size-3" />Priority</span>
            <span class="flex items-center gap-1"><HeaderDivider /><UserIcon class="size-3" />Assignee</span>
            <span class="flex items-center gap-1"><HeaderDivider /><ClockIcon class="size-3" />{timestampLabel()}</span>
          </div>
        </Match>
        <Match when={true}>
          <div
            class="grid items-center gap-x-2 min-w-0 w-full px-2 py-1.5 text-xs text-ink-extra-muted/50"
            style={{ 'grid-template-columns': '1.5rem minmax(0, 1fr) auto' }}
          >
            <span />
            <span class="flex items-center gap-1 -ml-3"><TextIcon class="size-3" />Title</span>
            <span class="flex items-center gap-1"><HeaderDivider /><ClockIcon class="size-3" />{timestampLabel()}</span>
          </div>
        </Match>
      </Switch>
    </Show>
  );
}
