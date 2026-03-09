import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import type { ListView } from '@app/constants/list-views';
import { createMemo, Match, Show, Switch } from 'solid-js';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import {
  CODE_LANGUAGE_FILTER_IDS,
  IMAGE_TYPE_FILTER_IDS,
} from '@app/component/next-soup/filters/filters';
import {
  AssigneeFilter,
  AttachmentTypeFilter,
  CodeLanguageFilter,
  DocumentFolderFilter,
  EntityTypeFilter,
  FilesTypeFilter,
  FromSenderFilter,
  HasAttachmentFilter,
  HasCalendarInviteFilter,
  ImageTypeFilter,
  ProjectFilter,
  StatusFilter,
  TaskPriorityFilter,
  TaskStatusFilter,
} from './filter-controls';

const FilterDivider = () => (
  <div class="flex items-center self-stretch mx-1">
    <div class="w-px h-4 bg-edge-muted" />
  </div>
);

export const SoupViewContextFilters = () => {
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
        <InboxFilters />
      </Match>
      <Match when={isComponentListView('agents')}>
        <AgentsFilters />
      </Match>
      <Match when={isComponentListView('mail')}>
        <MailFilters />
      </Match>
      <Match when={isComponentListView('tasks')}>
        <TasksFilters />
      </Match>
      <Match when={isComponentListView('channels')}>
        <ChannelsFilters />
      </Match>
      <Match when={isComponentListView('files')}>
        <FilesFilters />
      </Match>
    </Switch>
  );
};

const InboxFilters = () => {
  return <EntityTypeFilter />;
};

const AgentsFilters = () => {
  return <ProjectFilter />;
};

const MailFilters = () => {
  const { activeTab, soup } = useSoupView();

  const isDraftsTab = () => activeTab() === 'drafts';
  const isSentTab = () => activeTab() === 'sent';
  const hasAttachmentActive = () => soup.filters.isActive('has-attachment');

  return (
    <>
      <Show when={!isDraftsTab()}>
        <StatusFilter />
      </Show>

      <Show when={!isSentTab() && !isDraftsTab()}>
        <FromSenderFilter />
        <FilterDivider />
      </Show>

      <HasAttachmentFilter />

      <Show when={hasAttachmentActive()}>
        <AttachmentTypeFilter />
      </Show>

      <HasCalendarInviteFilter />
    </>
  );
};

const TasksFilters = () => {
  const { soup } = useSoupView();

  return (
    <>
      <TaskStatusFilter />
      <TaskPriorityFilter />
      <Show when={!soup.filters.isActive('assigned-to')}>
        <FilterDivider />
        <AssigneeFilter />
      </Show>
    </>
  );
};

const ChannelsFilters = () => {
  // No channels filters for now
  // TODO: Add channel filters
  return null;
};

const FilesFilters = () => {
  const { soup } = useSoupView();

  // Show sub-filter dropdown if parent is active OR any sub-filter is active
  const isImageFilterActive = () =>
    soup.filters.isActive('file-image') ||
    IMAGE_TYPE_FILTER_IDS.some((id) => soup.filters.isActive(id));
  const isCodeFilterActive = () =>
    soup.filters.isActive('file-code') ||
    CODE_LANGUAGE_FILTER_IDS.some((id) => soup.filters.isActive(id));

  return (
    <>
      <FilesTypeFilter />

      <Show when={isImageFilterActive()}>
        <ImageTypeFilter />
      </Show>

      <Show when={isCodeFilterActive()}>
        <CodeLanguageFilter />
      </Show>

      <FilterDivider />
      <DocumentFolderFilter />
    </>
  );
};
