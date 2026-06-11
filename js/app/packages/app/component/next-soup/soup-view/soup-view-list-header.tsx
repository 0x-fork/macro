import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import type { ListView } from '@app/constants/list-views';
import { isListViewID } from '@app/constants/list-views';
import { useListLayout } from '@entity';
import BellIcon from '@phosphor/bell.svg';
import ChatIcon from '@phosphor/chat-centered.svg';
import ClockIcon from '@phosphor/clock.svg';
import EnvelopeIcon from '@phosphor/envelope.svg';
import FolderSimpleIcon from '@phosphor/folder-simple.svg';
import HashIcon from '@phosphor/hash.svg';
import MagnifyingGlassIcon from '@phosphor/magnifying-glass.svg';
import RobotIcon from '@phosphor/robot.svg';
import TagIcon from '@phosphor/tag.svg';
import TextIcon from '@phosphor/text-aa.svg';
import UserIcon from '@phosphor/user.svg';
import { cn } from '@ui';
import { createMemo, For, type JSX, Match, Show, Switch } from 'solid-js';
import { SelectAllCheckbox } from './views/tasks/TaskListHeader';

type HeaderColumn = {
  label: string;
  icon?: () => JSX.Element;
  class?: string;
  iconOnly?: boolean;
};

type HeaderConfig = {
  columns: string;
  cells: HeaderColumn[];
};

const HEADER_ICON_CLASS = 'size-3 shrink-0 text-current';

const HeaderDivider = () => <span class="w-px h-3 bg-ink/20 shrink-0" />;

const ListHeaderShell = (props: HeaderConfig) => {
  const layout = useListLayout();
  const isWide = () => layout?.isWide() ?? true;

  return (
    <Show when={isWide()}>
      <div
        class="grid w-[calc(100%-0.5rem)] mx-1 px-2 py-1.5 items-center text-xs font-medium text-ink/45"
        style={{
          'grid-template-columns': '1.5rem 1fr',
          gap: '0 0.5rem',
        }}
      >
        <span class="self-center size-4 flex items-center justify-center mx-auto">
          <SelectAllCheckbox />
        </span>
        <div
          class="grid items-center gap-x-2 min-w-0 w-full"
          style={{ 'grid-template-columns': props.columns }}
        >
          <For each={props.cells}>
            {(cell, index) => (
              <span class={cn('min-w-0 flex items-center gap-1 truncate', cell.class)}>
                <Show when={index() > 0}>
                  <HeaderDivider />
                </Show>
                <Show when={cell.icon}>{(icon) => icon()()}</Show>
                <Show when={!cell.iconOnly}>
                  <span class="truncate">{cell.label}</span>
                </Show>
              </span>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
};

const timestampLabel = (sortId: string | undefined) => {
  switch (sortId) {
    case 'created_at':
      return 'Created';
    case 'viewed_at':
      return 'Viewed';
    default:
      return 'Updated';
  }
};

const useTimestampColumn = (): HeaderColumn => {
  const { soup } = useSoupView();
  return {
    label: timestampLabel(soup.sort.active()[0]?.id),
    icon: () => <ClockIcon class={HEADER_ICON_CLASS} />,
    class: 'justify-end',
  };
};

const InboxHeader = () => {
  const time = useTimestampColumn();
  return (
    <ListHeaderShell
      columns="1.5rem minmax(0,1fr) minmax(0,9rem) 4.5rem"
      cells={[
        { label: 'Type', icon: () => <TagIcon class={HEADER_ICON_CLASS} />, iconOnly: true, class: 'justify-center' },
        { label: 'Item', icon: () => <TextIcon class={HEADER_ICON_CLASS} /> },
        { label: 'Source', icon: () => <TagIcon class={HEADER_ICON_CLASS} /> },
        time,
      ]}
    />
  );
};

const MailHeader = () => {
  const time = useTimestampColumn();
  return (
    <ListHeaderShell
      columns="auto minmax(0,1fr) 21rem 4.5rem"
      cells={[
        { label: 'Type', icon: () => <EnvelopeIcon class={HEADER_ICON_CLASS} />, iconOnly: true, class: 'justify-center' },
        { label: 'From / Subject', icon: () => <UserIcon class={HEADER_ICON_CLASS} /> },
        { label: 'Mailbox', icon: () => <TagIcon class={HEADER_ICON_CLASS} /> },
        time,
      ]}
    />
  );
};

const DocumentsHeader = () => {
  const time = useTimestampColumn();
  return (
    <ListHeaderShell
      columns="1.5rem 1fr auto"
      cells={[
        { label: 'Type', icon: () => <TagIcon class={HEADER_ICON_CLASS} />, iconOnly: true, class: 'justify-center' },
        { label: 'Name / Location', icon: () => <TextIcon class={HEADER_ICON_CLASS} /> },
        time,
      ]}
    />
  );
};

const ChannelsHeader = () => {
  const time = useTimestampColumn();
  return (
    <ListHeaderShell
      columns="auto 12rem minmax(0,1fr) 21rem 4.5rem"
      cells={[
        { label: 'Type', icon: () => <TagIcon class={HEADER_ICON_CLASS} />, iconOnly: true, class: 'justify-center' },
        { label: 'Channel', icon: () => <HashIcon class={HEADER_ICON_CLASS} /> },
        { label: 'Last message', icon: () => <ChatIcon class={HEADER_ICON_CLASS} /> },
        { label: 'Participants', icon: () => <UserIcon class={HEADER_ICON_CLASS} /> },
        time,
      ]}
    />
  );
};

const AgentsHeader = () => {
  const time = useTimestampColumn();
  return (
    <ListHeaderShell
      columns="1.5rem 1fr auto"
      cells={[
        { label: 'Type', icon: () => <RobotIcon class={HEADER_ICON_CLASS} />, iconOnly: true, class: 'justify-center' },
        { label: 'Agent / Owner', icon: () => <UserIcon class={HEADER_ICON_CLASS} /> },
        time,
      ]}
    />
  );
};

const FoldersHeader = () => {
  const time = useTimestampColumn();
  return (
    <ListHeaderShell
      columns="1.5rem 1fr auto"
      cells={[
        { label: 'Type', icon: () => <FolderSimpleIcon class={HEADER_ICON_CLASS} />, iconOnly: true, class: 'justify-center' },
        { label: 'Folder / Owner', icon: () => <UserIcon class={HEADER_ICON_CLASS} /> },
        time,
      ]}
    />
  );
};

const NotificationsHeader = () => (
  <ListHeaderShell
    columns="1.5rem 1fr auto"
    cells={[
      { label: 'Type', icon: () => <BellIcon class={HEADER_ICON_CLASS} />, iconOnly: true, class: 'justify-center' },
      { label: 'Notification / Source', icon: () => <TagIcon class={HEADER_ICON_CLASS} /> },
      { label: 'Date', icon: () => <ClockIcon class={HEADER_ICON_CLASS} />, class: 'justify-end' },
    ]}
  />
);

const SearchHeader = () => {
  const time = useTimestampColumn();
  return (
    <ListHeaderShell
      columns="1.5rem 1fr auto"
      cells={[
        { label: 'Type', icon: () => <TagIcon class={HEADER_ICON_CLASS} />, iconOnly: true, class: 'justify-center' },
        { label: 'Result', icon: () => <MagnifyingGlassIcon class={HEADER_ICON_CLASS} /> },
        time,
      ]}
    />
  );
};

const DefaultHeader = () => {
  const time = useTimestampColumn();
  return (
    <ListHeaderShell
      columns="1.5rem 1fr auto"
      cells={[
        { label: 'Type', icon: () => <TagIcon class={HEADER_ICON_CLASS} />, iconOnly: true, class: 'justify-center' },
        { label: 'Item', icon: () => <TextIcon class={HEADER_ICON_CLASS} /> },
        time,
      ]}
    />
  );
};

export const SoupViewListHeader = () => {
  const panel = useSplitPanelOrThrow();

  const component = createMemo<ListView | undefined>(() => {
    const content = panel.handle.content();
    if (content.type !== 'component' || !isListViewID(content.id)) return;
    return content.id;
  });

  const isComponentListView = (view: ListView) => component() === view;

  return (
    <Switch fallback={<DefaultHeader />}>
      <Match when={isComponentListView('inbox')}>
        <InboxHeader />
      </Match>
      <Match when={isComponentListView('notifications')}>
        <NotificationsHeader />
      </Match>
      <Match when={isComponentListView('agents')}>
        <AgentsHeader />
      </Match>
      <Match when={isComponentListView('mail')}>
        <MailHeader />
      </Match>
      <Match when={isComponentListView('documents')}>
        <DocumentsHeader />
      </Match>
      <Match when={isComponentListView('channels')}>
        <ChannelsHeader />
      </Match>
      <Match when={isComponentListView('folders')}>
        <FoldersHeader />
      </Match>
      <Match when={isComponentListView('search')}>
        <SearchHeader />
      </Match>
    </Switch>
  );
};
