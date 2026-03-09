import {
  VIEW_TAB_PRESETS,
  type PresetContext,
} from '@app/component/app-sidebar/soup-filter-presets';
import type { FilterID } from '@app/component/next-soup/filters/filters';
import type { SoupItemsQueryFilters } from '@queries/soup/items';
import { useSoup } from '@app/component/next-soup/soup-context';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import type { ListView } from '@app/constants/list-views';
import { useUserContext } from '@core/context/user';
import {
  batch,
  createMemo,
  For,
  Match,
  type ParentComponent,
  Switch,
  type JSX,
  Show,
} from 'solid-js';
import {
  SegmentedControl as KSegmentedControl,
  type SegmentedControlRootProps,
} from '@kobalte/core/segmented-control';
import { RadioGroup } from '@kobalte/core/radio-group';
import { cn } from '@ui/utils/classname';
import SignalIcon from '@macro-icons/wide/signal.svg';
import NoiseIcon from '@macro-icons/wide/noise.svg';
import InfinityIcon from '@icon/regular/infinity.svg';
// Shared icons
import UserIcon from '@icon/regular/user.svg';
import UsersIcon from '@icon/regular/users.svg';
// Agents icons
import PlayIcon from '@icon/regular/play.svg';
// Mail icons
import StarIcon from '@icon/regular/star.svg';
import PencilIcon from '@icon/regular/pencil-simple.svg';
import PaperPlaneIcon from '@icon/regular/paper-plane-right.svg';
// Tasks icons
import UserCheckIcon from '@icon/regular/user-check.svg';
import PlusIcon from '@icon/regular/plus.svg';
// Channels icons
import ClockIcon from '@icon/regular/clock.svg';
import ChatIcon from '@icon/regular/chats.svg';

const useApplyPreset = () => {
  const soup = useSoup();
  const { setQueryFilters, setActiveTab } = useSoupView();
  const user = useUserContext();

  const getPresetContext = (): PresetContext => ({
    userId: user.userId(),
    email: user.email(),
  });

  const applyPreset = (preset: {
    queryFilters: SoupItemsQueryFilters;
    clientFilters: { and?: FilterID[]; or?: FilterID[] };
  }) => {
    batch(() => {
      setQueryFilters(preset.queryFilters);
      soup.filters.set(preset.clientFilters);
    });
  };

  const applyTabPreset = (view: ListView, tabId: string) => {
    const config = VIEW_TAB_PRESETS[view];
    const resolver = config.tabs[tabId];
    if (!resolver) return;

    const resolved = resolver(getPresetContext());
    if (!resolved) return;

    setActiveTab(tabId);
    applyPreset(resolved);
  };

  return { applyTabPreset };
};

export const SoupViewTabs = () => {
  const panel = useSplitPanelOrThrow();

  const component = createMemo(() => {
    const content = panel.handle.content();

    if (content.type !== 'component') return;

    return content.id;
  });

  const isComponentListView = (listView: ListView) => {
    return component() === listView;
  };

  return (
    <Switch>
      <Match when={isComponentListView('inbox')}>
        <InboxTabs />
      </Match>
      <Match when={isComponentListView('agents')}>
        <AgentsTabs />
      </Match>
      <Match when={isComponentListView('mail')}>
        <MailTabs />
      </Match>
      <Match when={isComponentListView('documents')}>
        <DocumentsTabs />
      </Match>
      <Match when={isComponentListView('tasks')}>
        <TasksTabs />
      </Match>
      <Match when={isComponentListView('channels')}>
        <ChannelsTabs />
      </Match>
      <Match when={isComponentListView('files')}>
        <FilesTabs />
      </Match>
    </Switch>
  );
};

const InboxTabs = () => {
  const { applyTabPreset } = useApplyPreset();
  const { activeTab } = useSoupView();

  return (
    <TabButtonGroup
      list={[
        {
          value: 'signal',
          label: 'Signal',
          icon: <SignalIcon class="size-3" />,
        },
        { value: 'noise', label: 'Noise', icon: <NoiseIcon class="size-3" /> },
        {
          value: 'all',
          label: 'All Items',
          icon: <InfinityIcon class="size-3" />,
        },
      ]}
      value={activeTab()}
      defaultValue={VIEW_TAB_PRESETS.inbox.default}
      onChange={(value) => applyTabPreset('inbox', value)}
    />
  );
};

const AgentsTabs = () => {
  const { applyTabPreset } = useApplyPreset();
  const { activeTab } = useSoupView();

  return (
    <TabButtonGroup
      list={[
        { value: 'owned', label: 'Owned', icon: <UserIcon class="size-3" /> },
        {
          value: 'running',
          label: 'Running',
          icon: <PlayIcon class="size-3" />,
        },
        {
          value: 'shared',
          label: 'Shared',
          icon: <UsersIcon class="size-3" />,
        },
      ]}
      value={activeTab()}
      defaultValue={VIEW_TAB_PRESETS.agents.default}
      onChange={(value) => applyTabPreset('agents', value)}
    />
  );
};

const MailTabs = () => {
  const { applyTabPreset } = useApplyPreset();
  const { activeTab } = useSoupView();

  return (
    <TabButtonGroup
      list={[
        {
          value: 'important',
          label: 'Important',
          icon: <StarIcon class="size-3" />,
        },
        { value: 'noise', label: 'Noise', icon: <NoiseIcon class="size-3" /> },
        {
          value: 'drafts',
          label: 'Drafts',
          icon: <PencilIcon class="size-3" />,
        },
        {
          value: 'sent',
          label: 'Sent',
          icon: <PaperPlaneIcon class="size-3" />,
        },
      ]}
      value={activeTab()}
      defaultValue={VIEW_TAB_PRESETS.mail.default}
      onChange={(value) => applyTabPreset('mail', value)}
    />
  );
};

const DocumentsTabs = () => {
  const { applyTabPreset } = useApplyPreset();
  const { activeTab } = useSoupView();

  return (
    <TabButtonGroup
      list={[
        { value: 'owned', label: 'Owned', icon: <UserIcon class="size-3" /> },
        {
          value: 'shared',
          label: 'Shared',
          icon: <UsersIcon class="size-3" />,
        },
        {
          value: 'all',
          label: 'All Docs',
          icon: <InfinityIcon class="size-3" />,
        },
      ]}
      value={activeTab()}
      defaultValue={VIEW_TAB_PRESETS.documents.default}
      onChange={(value) => applyTabPreset('documents', value)}
    />
  );
};

const TasksTabs = () => {
  const { applyTabPreset } = useApplyPreset();
  const { activeTab } = useSoupView();

  return (
    <TabButtonGroup
      list={[
        {
          value: 'assigned-to-me',
          label: 'Assigned',
          icon: <UserCheckIcon class="size-3" />,
        },
        {
          value: 'created-by-me',
          label: 'Created',
          icon: <PlusIcon class="size-3" />,
        },
        {
          value: 'all',
          label: 'All Tasks',
          icon: <InfinityIcon class="size-3" />,
        },
      ]}
      value={activeTab()}
      defaultValue={VIEW_TAB_PRESETS.tasks.default}
      onChange={(value) => applyTabPreset('tasks', value)}
    />
  );
};

const ChannelsTabs = () => {
  const { applyTabPreset } = useApplyPreset();
  const { activeTab } = useSoupView();

  return (
    <TabButtonGroup
      list={[
        {
          value: 'recent',
          label: 'Recent',
          icon: <ClockIcon class="size-3" />,
        },
        { value: 'people', label: 'People', icon: <UserIcon class="size-3" /> },
        { value: 'teams', label: 'Teams', icon: <ChatIcon class="size-3" /> },
      ]}
      value={activeTab()}
      defaultValue={VIEW_TAB_PRESETS.channels.default}
      onChange={(value) => applyTabPreset('channels', value)}
    />
  );
};

const FilesTabs = () => {
  const { applyTabPreset } = useApplyPreset();
  const { activeTab } = useSoupView();

  return (
    <TabButtonGroup
      list={[
        { value: 'owned', label: 'Owned', icon: <UserIcon class="size-3" /> },
        {
          value: 'shared',
          label: 'Shared',
          icon: <UsersIcon class="size-3" />,
        },
        {
          value: 'all',
          label: 'All Files',
          icon: <InfinityIcon class="size-3" />,
        },
      ]}
      value={activeTab()}
      defaultValue={VIEW_TAB_PRESETS.files.default}
      onChange={(value) => applyTabPreset('files', value)}
    />
  );
};

export const SegmentedControl: ParentComponent<
  {
    list: { value: string; label: string }[];
    value?: string;
    defaultValue?: string;
  } & Omit<SegmentedControlRootProps, 'defaultValue'>
> = (props) => {
  const onChange = (newValue: string) => {
    props.onChange?.(newValue);
  };

  return (
    <KSegmentedControl
      class="size-full text-sm border border-edge rounded-md p-0.5"
      value={props.value}
      defaultValue={props.defaultValue ?? props.list[0]?.value}
      onChange={onChange}
      disabled={props.disabled}
    >
      <div class="relative" role="presentation">
        <KSegmentedControl.Indicator class="absolute rounded bg-accent/15 border border-accent/30 transition-all ease-out" />
        <div class="flex" role="presentation">
          <For each={props.list}>
            {(item) => {
              const itemValue = () =>
                typeof item === 'object' ? item.value : item;
              const itemLabel = () =>
                typeof item === 'object' ? item.label : item;
              return (
                <KSegmentedControl.Item
                  value={itemValue()}
                  disabled={props.disabled}
                >
                  <KSegmentedControl.ItemInput class="absolute inset-0 pointer-events-none" />
                  <KSegmentedControl.ItemLabel class="relative text-ink-muted size-full px-3 py-1 text-xs font-medium data-[checked]:text-accent transition-colors block">
                    {itemLabel()}
                  </KSegmentedControl.ItemLabel>
                </KSegmentedControl.Item>
              );
            }}
          </For>
        </div>
      </div>
    </KSegmentedControl>
  );
};

/**
 * TabButtonGroup - A radio group styled as individual toggle buttons.
 * Each tab appears as a separate button, with only one active at a time.
 * Uses RadioGroup for proper accessibility and radio semantics.
 */
export const TabButtonGroup: ParentComponent<{
  list: { value: string; label: string; icon?: JSX.Element }[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}> = (props) => {
  return (
    <RadioGroup
      class="flex gap-1"
      value={props.value}
      defaultValue={props.defaultValue ?? props.list[0]?.value}
      onChange={(value) => props.onChange?.(value)}
      disabled={props.disabled}
    >
      <For each={props.list}>
        {(item) => (
          <RadioGroup.Item value={item.value} class="group">
            <RadioGroup.ItemInput class="sr-only" />
            <RadioGroup.ItemControl
              class={cn(
                'inline-flex items-center gap-1.5',
                'px-2.5 py-1 text-xs font-medium rounded cursor-default transition-all',
                'text-ink-muted/80 border border-edge-muted',
                'hover:bg-ink/8 hover:text-ink',
                'group-data-[checked]:bg-ink group-data-[checked]:text-page group-data-[checked]:border-ink group-data-[checked]:hover:bg-ink group-data-[checked]:hover:text-page',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink/30',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {/* <Show when={item.icon}>{item.icon}</Show> */}
              <RadioGroup.ItemLabel class="cursor-default">
                {item.label}
              </RadioGroup.ItemLabel>
            </RadioGroup.ItemControl>
          </RadioGroup.Item>
        )}
      </For>
    </RadioGroup>
  );
};
