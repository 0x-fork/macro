import { useSplitLayout } from '../split-layout/layout';
import { SearchState } from './mobileSearchState';
import { useSettingsState } from '@core/constant/SettingsState';
import { UserIcon } from '@core/component/UserIcon';
import { MobileDrawer } from './MobileDrawer';
import GearIcon from '@icon/regular/gear.svg';
import QuestionIcon from '@icon/regular/question.svg';
import SignOutIcon from '@icon/regular/sign-out.svg';
import MicrophoneIcon from '@icon/regular/microphone.svg';
import MicrophoneSlashIcon from '@icon/regular/microphone-slash.svg';
import VideoCameraIcon from '@icon/regular/video-camera.svg';
import VideoCameraSlashIcon from '@icon/regular/video-camera-slash.svg';
import PhoneDisconnectIcon from '@icon/regular/phone-disconnect.svg';
import { Layer } from '@ui';
import { focusInput } from '@core/directive/focusInput';
import { cn } from '@ui/utils/classname';
import { For, Show, createMemo, createSignal, Suspense, createEffect, onCleanup } from 'solid-js';
import { useUserContext } from '@core/context/user';
import LogoIcon from '@macro-icons/macro-logo.svg';
import SearchIcon from '@macro-icons/macro-magnifying-glass.svg';
import ClockIcon from '@icon/regular/clock.svg';
import CaretRightIcon from '@icon/regular/caret-right.svg';
import SparkleIcon from '@icon/regular/sparkle.svg';
import ArrowClockwiseIcon from '@icon/regular/arrow-clockwise.svg';
import { HexDashedIcon } from '@macro-icons/square/HexDashedIcon';
import { useAutomationEntities } from '@queries/agent-schedule/entities';
import { useCallContextOptional } from '@channel/Call/CallContext';
import { AnimatedInboxIcon } from '@macro-icons/wide/animating/inbox';
import { AnimatedEmailIcon } from '@macro-icons/wide/animating/email';
import { AnimatedChannelIcon } from '@macro-icons/wide/animating/channel';
import { AnimatedTaskIcon } from '@macro-icons/wide/animating/task';
import { AnimatedFileMdIcon } from '@macro-icons/wide/animating/fileMd';
import { AnimatedStarIcon } from '@macro-icons/wide/animating/star';
import { Entity, type EntityData, isTaskEntity, type TaskEntity, unreadFilterFn } from '@entity';
import { TaskPropertyGroup } from '@entity/composed/StackedListEntity';
import { SYSTEM_PROPERTY_IDS } from '@core/component/Properties/constants';
import { useSoupItemsQuery, type SoupItemsQueryArgs } from '@queries/soup/items';
import { useUserNotificationsQuery } from '@queries/notification/user-notifications';
import { itemToBlockName } from '@core/constant/allBlocks';
import type { ListView } from '@app/constants/list-views';
import type { Component, JSX } from 'solid-js';
import { PROPERTY_OPTION_IDS } from '@core/component/Properties/constants';
import { queryClient } from '@queries/client';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

false && focusInput;

const RECENT_ITEMS_LIMIT = 4;
const TASKS_LIMIT = 4;

const recentItemsArgs: SoupItemsQueryArgs = {
  params: {
    sort_method: 'viewed_at',
    limit: RECENT_ITEMS_LIMIT,
  },
  body: {
    call_filters: {
      call_ids: [NIL_UUID],
    },
  },
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function AvatarMenu() {
  const user = useUserContext();
  const { toggleSettings } = useSettingsState();
  const [open, setOpen] = createSignal(false);
  const automations = useAutomationEntities();

  const hasRunningAgents = createMemo(() => {
    const entities = automations();
    if (!entities) return false;
    return entities.some((e) => e.isRunning);
  });

  const handleSignOut = () => {
    window.location.href = '/api/auth/logout';
  };

  return (
    <MobileDrawer open={open()} onOpenChange={setOpen}>
      <MobileDrawer.Trigger class="focus:outline-none">
        <div class="relative">
          <div class="size-8 rounded-full overflow-hidden ring-2 ring-transparent active:ring-accent/20 transition-all">
            <UserIcon id={user.userId() ?? ''} size="fill" />
          </div>
          <Show when={hasRunningAgents()}>
            <div class="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-success border-2 border-panel animate-pulse" />
          </Show>
        </div>
      </MobileDrawer.Trigger>
      <MobileDrawer.Portal>
        <MobileDrawer.Overlay class="fixed inset-0 z-modal-overlay bg-modal-overlay" />
        <MobileDrawer.Content class="scrollbar-hide">
          <MobileDrawer.Handle />
          <div class="pb-4 space-y-3 overflow-y-auto scrollbar-hide">
            <div class="flex items-center gap-3 p-4 mx-3 bg-ink/5 rounded-2xl">
              <div class="size-12 rounded-full overflow-hidden shrink-0">
                <UserIcon id={user.userId() ?? ''} size="fill" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-base font-medium text-ink truncate">{user.author()}</div>
                <div class="text-sm text-ink-muted truncate">{user.email()}</div>
              </div>
            </div>

            <MobileDrawer.Section class="bg-panel">
              <button
                type="button"
                class="flex items-center gap-3 w-full px-4 py-3.5 text-base text-ink active:bg-ink/5"
                onClick={() => {
                  setOpen(false);
                  toggleSettings();
                }}
              >
                <GearIcon class="size-5 text-ink-muted" />
                Settings
              </button>
              <div class="h-px bg-edge-muted ml-14" />
              <button
                type="button"
                class="flex items-center gap-3 w-full px-4 py-3.5 text-base text-ink active:bg-ink/5"
                onClick={() => window.open('https://help.macro.com', '_blank')}
              >
                <QuestionIcon class="size-5 text-ink-muted" />
                Help & Support
              </button>
            </MobileDrawer.Section>

            <MobileDrawer.Section class="bg-panel mt-4">
              <button
                type="button"
                class="flex items-center gap-3 w-full px-4 py-3.5 text-base text-failure active:bg-failure/5"
                onClick={handleSignOut}
              >
                <SignOutIcon class="size-5" />
                Sign Out
              </button>
            </MobileDrawer.Section>
          </div>
        </MobileDrawer.Content>
      </MobileDrawer.Portal>
    </MobileDrawer>
  );
}

function HomeSearchBar(props: { compact?: boolean; class?: string }) {
  return (
    <button
      type="button"
      use:focusInput={{
        getTarget: () => document.getElementById('mobile-search-input'),
      }}
      onClick={() => {
        SearchState.maybeResetState();
        SearchState.open();
      }}
      class={cn(
        'flex items-center gap-2 bg-ink/5 text-ink-muted text-sm transition-all',
        props.compact
          ? 'px-4 py-2.5 rounded-xl'
          : 'w-full px-4 py-3 rounded-xl',
        props.class
      )}
    >
      <SearchIcon class={cn('shrink-0', props.compact ? 'size-4' : 'size-5')} />
      <span class={cn('truncate', props.compact ? 'text-xs' : '')}>
        {props.compact ? 'Search...' : 'Search anything...'}
      </span>
    </button>
  );
}

interface QuickAccessItem {
  id: ListView;
  label: string;
  icon: Component<JSX.SvgSVGAttributes<SVGSVGElement> & { triggerAnimation?: boolean }>;
  bgColor: string;
  iconColor: string;
}

function QuickAccessCard(props: {
  item: QuickAccessItem;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class={cn(
        'flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl active:scale-95 transition-all',
        props.item.bgColor
      )}
    >
      <div class={cn('size-7 [&_svg]:size-7', props.item.iconColor)}>
        <props.item.icon />
      </div>
      <span class="text-xs text-ink font-medium">{props.item.label}</span>
    </button>
  );
}

function QuickAccessGrid() {
  const { openWithSplit } = useSplitLayout();

  const quickItems: QuickAccessItem[] = [
    {
      id: 'inbox',
      label: 'Inbox',
      icon: AnimatedInboxIcon,
      bgColor: 'bg-accent/10',
      iconColor: 'text-accent',
    },
    {
      id: 'mail',
      label: 'Mail',
      icon: AnimatedEmailIcon,
      bgColor: 'bg-ink/5',
      iconColor: 'text-ink-muted',
    },
    {
      id: 'channels',
      label: 'Channels',
      icon: AnimatedChannelIcon,
      bgColor: 'bg-success/10',
      iconColor: 'text-success',
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: AnimatedTaskIcon,
      bgColor: 'bg-task/10',
      iconColor: 'text-task',
    },
    {
      id: 'documents',
      label: 'Docs',
      icon: AnimatedFileMdIcon,
      bgColor: 'bg-note/10',
      iconColor: 'text-note',
    },
    {
      id: 'agents',
      label: 'Agents',
      icon: AnimatedStarIcon,
      bgColor: 'bg-chat/10',
      iconColor: 'text-chat',
    },
  ];

  const navigate = (id: ListView) => {
    openWithSplit({ type: 'component', id });
  };

  return (
    <div class="grid grid-cols-3 gap-2">
      <For each={quickItems}>
        {(item) => (
          <QuickAccessCard item={item} onClick={() => navigate(item.id)} />
        )}
      </For>
    </div>
  );
}

function SectionHeader(props: {
  icon: Component<JSX.SvgSVGAttributes<SVGSVGElement>>;
  title: string;
  onSeeAll?: () => void;
}) {
  return (
    <div class="flex items-center justify-between mb-3 px-1">
      <div class="flex items-center gap-2">
        <props.icon class="size-4 text-ink-muted" />
        <span class="text-sm font-semibold text-ink">{props.title}</span>
      </div>
      <Show when={props.onSeeAll}>
        <button
          type="button"
          onClick={props.onSeeAll}
          class="text-xs text-accent font-medium active:opacity-70"
        >
          See all
        </button>
      </Show>
    </div>
  );
}

function EntityItemRow(props: { entity: EntityData; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex items-center gap-3 px-3 py-2.5 active:bg-ink/5 transition-colors w-full text-left"
    >
      <div class="size-9 rounded-lg bg-ink/5 flex items-center justify-center text-ink-muted shrink-0 border border-edge-muted">
        <div class="size-4 flex items-center justify-center [&_svg]:size-4">
          <Entity.Icon entity={props.entity} />
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm text-ink truncate font-medium">
          <Entity.Title entity={props.entity} />
        </div>
        <div class="text-xs text-ink-extra-muted mt-0.5">
          <Entity.Timestamp entity={props.entity} />
        </div>
      </div>
      <CaretRightIcon class="size-4 text-ink-extra-muted shrink-0" />
    </button>
  );
}

function TaskItemRow(props: { entity: TaskEntity; onClick: () => void }) {
  const hasStatus = createMemo(() => {
    const properties = props.entity.properties ?? [];
    return properties.some((p) => p.property_definition_id === SYSTEM_PROPERTY_IDS.STATUS);
  });

  const hasPriority = createMemo(() => {
    const properties = props.entity.properties ?? [];
    return properties.some((p) => p.property_definition_id === SYSTEM_PROPERTY_IDS.PRIORITY);
  });

  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex items-center gap-3 px-3 py-2.5 active:bg-ink/5 transition-colors w-full text-left"
    >
      <div class="size-9 rounded-lg bg-ink/5 flex items-center justify-center text-ink-muted shrink-0 border border-edge-muted [&_svg]:size-4">
        <Show
          when={hasStatus()}
          fallback={<HexDashedIcon class="size-4 text-ink-extra-muted" />}
        >
          <TaskPropertyGroup
            entity={props.entity}
            include={[SYSTEM_PROPERTY_IDS.STATUS]}
          />
        </Show>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm text-ink truncate font-medium">
          <Entity.Title entity={props.entity} />
        </div>
        <div class="flex items-center gap-2 mt-1">
          <Show when={hasPriority()}>
            <div class="[&_div[role='button']]:!p-0 [&_div[role='button']]:!h-fit">
              <TaskPropertyGroup
                entity={props.entity}
                include={[SYSTEM_PROPERTY_IDS.PRIORITY]}
              />
            </div>
          </Show>
          <span class="text-xs text-ink-extra-muted">
            <Entity.Timestamp entity={props.entity} />
          </span>
        </div>
      </div>
      <CaretRightIcon class="size-4 text-ink-extra-muted shrink-0" />
    </button>
  );
}

function AISummarySection() {
  const user = useUserContext();
  const notificationsQuery = useUserNotificationsQuery({ limit: 50 });

  const unreadCount = createMemo(() => {
    const notifications = notificationsQuery.data;
    if (!notifications) return 0;
    return notifications.filter((n) => !n.viewed_at && !n.done_at).length;
  });

  const tasksArgs = createMemo((): SoupItemsQueryArgs => ({
    params: {
      sort_method: 'updated_at',
      limit: 20,
    },
    body: {
      document_filters: {
        sub_type: ['task'],
        properties: user.userId()
          ? [
              {
                property_id: SYSTEM_PROPERTY_IDS.ASSIGNEES,
                type: 'entity',
                value: user.userId()!,
              },
            ]
          : undefined,
        properties_exclude: [
          {
            property_id: SYSTEM_PROPERTY_IDS.STATUS,
            type: 'select',
            value: PROPERTY_OPTION_IDS.STATUS.COMPLETED,
          },
          {
            property_id: SYSTEM_PROPERTY_IDS.STATUS,
            type: 'select',
            value: PROPERTY_OPTION_IDS.STATUS.CANCELED,
          },
        ],
      },
    },
  }));

  const tasksQuery = useSoupItemsQuery(tasksArgs, () => ({
    enabled: !!user.userId(),
  }));

  const taskCount = createMemo(() => {
    const data = tasksQuery.data;
    if (!data) return 0;
    return data.filter(isTaskEntity).length;
  });

  return (
    <div class="rounded-2xl bg-page bg-gradient-to-br from-accent/10 via-chat/5 to-page p-4 border border-accent/20">
      <div class="flex items-start gap-3">
        <div class="size-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <SparkleIcon class="size-4 text-accent" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-ink mb-1">{getGreeting()}</div>
          <div class="text-xs text-ink-muted leading-relaxed">
            <Show
              when={taskCount() > 0 || unreadCount() > 0}
              fallback="You're all caught up!"
            >
              <Show when={taskCount() > 0}>
                You have <span class="text-ink font-medium">{taskCount()} active {taskCount() === 1 ? 'task' : 'tasks'}</span>
              </Show>
              <Show when={taskCount() > 0 && unreadCount() > 0}> and </Show>
              <Show when={unreadCount() > 0}>
                <span class="text-ink font-medium">{unreadCount()} unread {unreadCount() === 1 ? 'notification' : 'notifications'}</span>
              </Show>
              .
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuggestedActionsSection() {
  const { openWithSplit } = useSplitLayout();
  const [hidden, setHidden] = createSignal(false);

  // Mock data - would come from AI analysis
  const actions = [
    { type: 'email' as const, title: "Reply to Alex's email", subtitle: 'Waiting 2 days', id: 'mock-1' },
    { type: 'task' as const, title: 'Review Q4 planning doc', subtitle: 'Due tomorrow', id: 'mock-2' },
    { type: 'channel' as const, title: 'Catch up on #design', subtitle: '15 new messages', id: 'mock-3' },
  ];

  const getIcon = (type: 'email' | 'task' | 'channel') => {
    switch (type) {
      case 'email': return AnimatedEmailIcon;
      case 'task': return AnimatedTaskIcon;
      case 'channel': return AnimatedChannelIcon;
    }
  };

  const getBgColor = (type: 'email' | 'task' | 'channel') => {
    switch (type) {
      case 'email': return 'bg-email/10';
      case 'task': return 'bg-task/10';
      case 'channel': return 'bg-channel/10';
    }
  };

  const getColor = (type: 'email' | 'task' | 'channel') => {
    switch (type) {
      case 'email': return 'text-email';
      case 'task': return 'text-task';
      case 'channel': return 'text-channel';
    }
  };

  return (
    <Show when={!hidden()}>
      <div>
        <div class="flex items-center justify-between mb-3 px-1">
          <div class="flex items-center gap-2">
            <SparkleIcon class="size-4 text-accent" />
            <span class="text-sm font-semibold text-ink">Suggested for you</span>
          </div>
          <button
            type="button"
            onClick={() => setHidden(true)}
            class="text-xs text-ink-muted active:text-ink transition-colors px-2 py-1 -mr-2"
          >
            Hide
          </button>
        </div>
        <div class="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <For each={actions}>
            {(action) => {
              const Icon = getIcon(action.type);
              return (
                <button
                  type="button"
                  class="flex-none w-44 p-3 rounded-xl bg-ink/5 active:bg-ink/10 transition-colors text-left"
                  onClick={() => {
                    // Would navigate to the actual item
                  }}
                >
                  <div class={cn('size-8 rounded-lg flex items-center justify-center mb-2.5', getBgColor(action.type))}>
                    <div class={cn('size-4', getColor(action.type))}>
                      <Icon />
                    </div>
                  </div>
                  <div class="text-sm font-medium text-ink line-clamp-2 leading-tight">{action.title}</div>
                  <div class="text-xs text-ink-muted mt-1.5">{action.subtitle}</div>
                </button>
              );
            }}
          </For>
        </div>
      </div>
    </Show>
  );
}

function RecentsSkeleton() {
  return (
    <div class="rounded-xl bg-ink/5 overflow-hidden">
      <For each={[1, 2, 3, 4]}>
        {() => (
          <div class="flex items-center gap-3 px-3 py-2.5 border-b border-edge-muted last:border-b-0">
            <div class="size-9 rounded-lg bg-ink/10 animate-pulse" />
            <div class="flex-1 space-y-2">
              <div class="h-4 w-3/4 bg-ink/10 rounded animate-pulse" />
              <div class="h-3 w-1/3 bg-ink/10 rounded animate-pulse" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function TasksSkeleton() {
  return (
    <div class="rounded-xl bg-ink/5 overflow-hidden">
      <For each={[1, 2]}>
        {() => (
          <div class="flex items-center gap-3 px-3 py-2.5 border-b border-edge-muted last:border-b-0">
            <div class="size-9 rounded-lg bg-ink/10 animate-pulse" />
            <div class="flex-1 space-y-2">
              <div class="h-4 w-2/3 bg-ink/10 rounded animate-pulse" />
              <div class="flex items-center gap-2">
                <div class="h-5 w-16 bg-ink/10 rounded-full animate-pulse" />
                <div class="h-3 w-12 bg-ink/10 rounded animate-pulse" />
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function ConversationsSkeleton() {
  return (
    <div class="flex gap-3 overflow-hidden">
      <For each={[1, 2, 3, 4, 5]}>
        {() => (
          <div class="flex flex-col items-center gap-2 shrink-0 w-16">
            <div class="size-14 rounded-xl bg-ink/5 animate-pulse" />
            <div class="h-3 w-12 rounded bg-ink/5 animate-pulse" />
          </div>
        )}
      </For>
    </div>
  );
}

function EmptyState(props: { icon: Component<JSX.SvgSVGAttributes<SVGSVGElement>>; message: string; color?: string }) {
  return (
    <div class={cn('px-4 py-8 text-center rounded-xl bg-ink/5', props.color)}>
      <div class="size-12 mx-auto mb-3 rounded-full bg-ink/5 flex items-center justify-center">
        <props.icon class="size-6 text-ink-extra-muted" />
      </div>
      <p class="text-sm text-ink-extra-muted">{props.message}</p>
    </div>
  );
}

function RecentsSection() {
  const { openWithSplit } = useSplitLayout();
  const recentItemsQuery = useSoupItemsQuery(() => recentItemsArgs);

  const recentItems = createMemo(() => {
    const data = recentItemsQuery.data;
    if (!data) return [];
    return data.slice(0, RECENT_ITEMS_LIMIT);
  });

  const handleItemClick = (entity: EntityData) => {
    const blockName = itemToBlockName(entity);
    if (blockName) {
      openWithSplit({ type: blockName, id: entity.id });
    }
  };

  return (
    <div>
      <SectionHeader icon={ClockIcon} title="Recent" />
      <Show when={!recentItemsQuery.isLoading} fallback={<RecentsSkeleton />}>
        <Show
          when={recentItems().length > 0}
          fallback={<EmptyState icon={ClockIcon} message="No recent items yet" />}
        >
          <div class="rounded-xl bg-ink/5 overflow-hidden divide-y divide-edge-muted">
            <For each={recentItems()}>
              {(entity) => (
                <EntityItemRow
                  entity={entity}
                  onClick={() => handleItemClick(entity)}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function TasksSection() {
  const { openWithSplit } = useSplitLayout();
  const user = useUserContext();

  const tasksArgs = createMemo((): SoupItemsQueryArgs => ({
    params: {
      sort_method: 'updated_at',
      limit: TASKS_LIMIT,
    },
    body: {
      document_filters: {
        sub_type: ['task'],
        properties: user.userId()
          ? [
              {
                property_id: SYSTEM_PROPERTY_IDS.ASSIGNEES,
                type: 'entity',
                value: user.userId()!,
              },
            ]
          : undefined,
        properties_exclude: [
          {
            property_id: SYSTEM_PROPERTY_IDS.STATUS,
            type: 'select',
            value: PROPERTY_OPTION_IDS.STATUS.COMPLETED,
          },
          {
            property_id: SYSTEM_PROPERTY_IDS.STATUS,
            type: 'select',
            value: PROPERTY_OPTION_IDS.STATUS.CANCELED,
          },
        ],
      },
    },
  }));

  const tasksQuery = useSoupItemsQuery(tasksArgs, () => ({
    enabled: !!user.userId(),
  }));

  const tasks = createMemo(() => {
    const data = tasksQuery.data;
    if (!data) return [];
    return data.filter(isTaskEntity).slice(0, TASKS_LIMIT);
  });

  const handleTaskClick = (entity: EntityData) => {
    openWithSplit({ type: 'task', id: entity.id });
  };

  const handleSeeAll = () => {
    openWithSplit({ type: 'component', id: 'tasks' });
  };

  return (
    <div>
      <SectionHeader
        icon={AnimatedTaskIcon}
        title="My Tasks"
        onSeeAll={handleSeeAll}
      />
      <Show when={!tasksQuery.isLoading} fallback={<TasksSkeleton />}>
        <Show
          when={tasks().length > 0}
          fallback={<EmptyState icon={AnimatedTaskIcon} message="No active tasks assigned to you" />}
        >
          <div class="rounded-xl bg-ink/5 overflow-hidden divide-y divide-edge-muted">
            <For each={tasks()}>
              {(entity) => (
                <TaskItemRow
                  entity={entity}
                  onClick={() => handleTaskClick(entity)}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function ConversationSquare(props: { entity: EntityData; onClick: () => void }) {
  const isUnread = createMemo(() => {
    try {
      return unreadFilterFn(props.entity as any);
    } catch {
      return false;
    }
  });

  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex flex-col items-center gap-2 shrink-0 w-16 active:opacity-70 transition-opacity"
    >
      <div class="relative">
        <div class="size-14 rounded-xl bg-ink/5 flex items-center justify-center text-ink-muted border border-edge-muted">
          <div class="size-6 flex items-center justify-center [&_svg]:size-6">
            <Entity.Icon entity={props.entity} />
          </div>
        </div>
        <Show when={isUnread()}>
          <div class="absolute -top-1 -right-1 size-3 rounded-full bg-accent border-2 border-page" />
        </Show>
      </div>
      <span class="text-xs text-ink truncate w-full text-center">
        <Entity.Title entity={props.entity} />
      </span>
    </button>
  );
}

function ConversationsSection() {
  const { openWithSplit } = useSplitLayout();

  const conversationsArgs: SoupItemsQueryArgs = {
    params: {
      sort_method: 'updated_at',
      limit: 50,
    },
    body: {
      document_filters: {
        document_ids: [NIL_UUID],
      },
      email_filters: {
        thread_ids: [NIL_UUID],
      },
      chat_filters: {
        chat_ids: [NIL_UUID],
      },
      folder_filters: {
        folder_ids: [NIL_UUID],
      },
      call_filters: {
        call_ids: [NIL_UUID],
      },
    },
  };

  const conversationsQuery = useSoupItemsQuery(() => conversationsArgs);

  const conversations = createMemo(() => {
    const data = conversationsQuery.data;
    if (!data) return [];
    return data.filter((e) => e.type === 'channel').slice(0, 8);
  });

  const handleConversationClick = (entity: EntityData) => {
    openWithSplit({ type: 'channel', id: entity.id });
  };

  const handleSeeAll = () => {
    openWithSplit({ type: 'component', id: 'channels' });
  };

  return (
    <div>
      <SectionHeader
        icon={AnimatedChannelIcon}
        title="Conversations"
        onSeeAll={handleSeeAll}
      />
      <Show when={!conversationsQuery.isLoading} fallback={<ConversationsSkeleton />}>
        <Show
          when={conversations().length > 0}
          fallback={<EmptyState icon={AnimatedChannelIcon} message="No recent conversations" />}
        >
          <div class="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
            <For each={conversations()}>
              {(entity) => (
                <ConversationSquare
                  entity={entity}
                  onClick={() => handleConversationClick(entity)}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function PullToRefreshIndicator(props: { visible: boolean; refreshing: boolean }) {
  return (
    <div
      class={cn(
        'absolute left-1/2 -translate-x-1/2 flex items-center justify-center transition-all duration-200',
        props.visible ? 'top-2 opacity-100' : '-top-8 opacity-0'
      )}
    >
      <div class={cn(
        'size-8 rounded-full bg-panel border border-edge-muted shadow-lg flex items-center justify-center',
        props.refreshing && 'animate-spin'
      )}>
        <ArrowClockwiseIcon class="size-4 text-ink-muted" />
      </div>
    </div>
  );
}

function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function CallBanner() {
  const callContext = useCallContextOptional();
  const [duration, setDuration] = createSignal(0);

  const isInCall = createMemo(() => callContext?.isInCall?.() ?? false);

  createEffect(() => {
    if (!isInCall()) {
      setDuration(0);
      return;
    }

    const interval = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);

    onCleanup(() => clearInterval(interval));
  });

  return (
    <Show when={isInCall()}>
      <div class="bg-success text-white px-4 py-2 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="size-2 rounded-full bg-white animate-pulse" />
          <span class="text-sm font-medium">In Call</span>
          <span class="text-sm opacity-80">{formatCallDuration(duration())}</span>
        </div>

        <div class="flex items-center gap-1">
          <button
            type="button"
            onClick={() => callContext?.toggleAudio?.()}
            class={cn(
              'size-8 rounded-full flex items-center justify-center transition-colors',
              callContext?.isAudioMuted?.() ? 'bg-white/20' : 'bg-transparent'
            )}
          >
            <Show
              when={callContext?.isAudioMuted?.()}
              fallback={<MicrophoneIcon class="size-4" />}
            >
              <MicrophoneSlashIcon class="size-4" />
            </Show>
          </button>

          <button
            type="button"
            onClick={() => callContext?.toggleVideo?.()}
            class={cn(
              'size-8 rounded-full flex items-center justify-center transition-colors',
              callContext?.isVideoMuted?.() ? 'bg-white/20' : 'bg-transparent'
            )}
          >
            <Show
              when={callContext?.isVideoMuted?.()}
              fallback={<VideoCameraIcon class="size-4" />}
            >
              <VideoCameraSlashIcon class="size-4" />
            </Show>
          </button>

          <button
            type="button"
            onClick={() => callContext?.disconnect?.()}
            class="size-8 rounded-full bg-failure flex items-center justify-center ml-1"
          >
            <PhoneDisconnectIcon class="size-4" />
          </button>
        </div>
      </div>
    </Show>
  );
}

export function MobileHome() {
  const [scrollY, setScrollY] = createSignal(0);
  const [pullDistance, setPullDistance] = createSignal(0);
  const [isRefreshing, setIsRefreshing] = createSignal(false);
  let scrollRef: HTMLDivElement | undefined;
  let touchStartY = 0;

  const isScrolled = () => scrollY() > 50;
  const searchBarProgress = () => Math.min(scrollY() / 50, 1);
  const showPullIndicator = () => pullDistance() > 40 && !isRefreshing();

  const handleScroll = (e: Event) => {
    const target = e.currentTarget as HTMLDivElement;
    setScrollY(target.scrollTop);
  };

  const handleTouchStart = (e: TouchEvent) => {
    touchStartY = e.touches[0].clientY;
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (scrollY() > 0) return;
    const touchY = e.touches[0].clientY;
    const distance = touchY - touchStartY;
    if (distance > 0) {
      setPullDistance(Math.min(distance * 0.5, 100));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance() > 60 && !isRefreshing()) {
      setIsRefreshing(true);
      await queryClient.invalidateQueries();
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 500);
    } else {
      setPullDistance(0);
    }
  };

  return (
    <div class="flex flex-col h-full bg-page bg-gradient-to-b from-accent/5 to-transparent to-30%">
      <CallBanner />

      <div class="flex-1 flex flex-col min-h-0">
        <div
          class={cn(
            'flex items-center gap-3 px-4 py-4 transition-all duration-200 relative z-10 shrink-0',
            isScrolled() && 'backdrop-saturate-150 backdrop-blur-lg bg-gradient-to-b from-page/80 via-page/60 to-transparent'
          )}
        >
          <Show when={!isScrolled()}>
            <div class="absolute left-4">
              <LogoIcon class="size-6 text-accent" />
            </div>
          </Show>

          <div
            class="flex-1 flex items-center transition-all duration-200 h-10"
            style={{
              opacity: searchBarProgress(),
            }}
          >
            <Show when={isScrolled()}>
              <HomeSearchBar compact class="w-full" />
            </Show>
          </div>

          <div class="shrink-0">
            <AvatarMenu />
          </div>
        </div>

        <div
          ref={scrollRef}
          class="flex-1 overflow-y-auto overscroll-contain pb-(--safe-bottom) relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <PullToRefreshIndicator
            visible={showPullIndicator() || isRefreshing()}
            refreshing={isRefreshing()}
          />

          <div
            class="px-4 pt-2 pb-6 space-y-8 transition-transform duration-200"
            style={{ transform: `translateY(${isRefreshing() ? 40 : pullDistance() * 0.3}px)` }}
          >
            <div
              class="transition-all duration-200"
              style={{
                opacity: 1 - searchBarProgress(),
                transform: `scale(${1 - searchBarProgress() * 0.05})`,
                'transform-origin': 'top right',
              }}
            >
              <HomeSearchBar />
            </div>

            <AISummarySection />

            <SuggestedActionsSection />

            <Suspense fallback={<ConversationsSkeleton />}>
              <ConversationsSection />
            </Suspense>

            <Suspense fallback={<RecentsSkeleton />}>
              <RecentsSection />
            </Suspense>

            <div>
              <h2 class="text-sm font-semibold text-ink mb-3 px-1">
                Quick Access
              </h2>
              <QuickAccessGrid />
            </div>

            <Suspense fallback={<TasksSkeleton />}>
              <TasksSection />
            </Suspense>
          </div>
        </div>

      </div>
    </div>
  );
}
