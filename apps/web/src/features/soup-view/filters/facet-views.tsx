import type { ListView } from '@app/constants/list-views';
import type { FacetId } from '@app/features/soup-list/facets';
import { EntityIcon } from '@core/component/EntityIcon';
import { PropertyValueIcon } from '@property/component/propertyValue/PropertyValueIcon';
import { PROPERTY_OPTION_IDS } from '@property/constants';
import type { JSX } from 'solid-js';

// Per-view filter menus. `id` is the backing facet's id (from ALL_FACETS);
// presentation — labels + icon JSX — lives here, keeping facet configs pure data.

export type FilterOption = {
  id: string;
  label: string;
  icon?: () => JSX.Element;
};

export type FilterCategory = {
  id: FacetId;
  label: string;
  labelPlural?: string;
  options: FilterOption[];
  multiple?: boolean;
};

export function buildContactLabel(
  contact: { id: string; name?: string | null },
  currentUserId: string | undefined
): string {
  if (contact.id === currentUserId) {
    return contact.name ? `${contact.name} (me)` : 'Me';
  }
  return contact.name || contact.id;
}

const INBOX_FILTER_CATEGORIES: FilterCategory[] = [
  {
    id: 'entity_type',
    label: 'Type',
    labelPlural: 'Types',
    options: [
      {
        id: 'document',
        label: 'Docs',
        icon: () => <EntityIcon targetType="md" size="xs" />,
      },
      {
        id: 'agent',
        label: 'Agents',
        icon: () => <EntityIcon targetType="chat" size="xs" />,
      },
      {
        id: 'people',
        label: 'People',
        icon: () => <EntityIcon targetType="direct_message" size="xs" />,
      },
      {
        id: 'teams',
        label: 'Teams',
        icon: () => <EntityIcon targetType="channel" size="xs" />,
      },
      {
        id: 'task',
        label: 'Tasks',
        icon: () => <EntityIcon targetType="task" size="xs" />,
      },
      {
        id: 'email',
        label: 'Mail',
        icon: () => <EntityIcon targetType="email" size="xs" />,
      },
      {
        id: 'file',
        label: 'Files',
        icon: () => <EntityIcon targetType="files" size="xs" />,
      },
      {
        id: 'github-pr',
        label: 'GitHub PRs',
        icon: () => <EntityIcon targetType="githubPullRequest" size="xs" />,
      },
    ],
    multiple: true,
  },
];

const MAIL_FILTER_CATEGORIES: FilterCategory[] = [
  {
    id: 'status',
    label: 'Status',
    labelPlural: 'Statuses',
    options: [
      { id: 'unread', label: 'Unread' },
      { id: 'read', label: 'Read' },
      { id: 'not-done', label: 'Not Done' },
      { id: 'done', label: 'Done' },
    ],
    multiple: true,
  },
  {
    id: 'attachment',
    label: 'Attachments',
    labelPlural: 'Attachments',
    options: [
      {
        id: 'attachment-pdf',
        label: 'PDFs',
        icon: () => <EntityIcon targetType="pdf" size="xs" />,
      },
      {
        id: 'attachment-image',
        label: 'Images',
        icon: () => <EntityIcon targetType="image" size="xs" />,
      },
      {
        id: 'attachment-document',
        label: 'Documents',
        icon: () => <EntityIcon targetType="files" size="xs" />,
      },
    ],
    multiple: true,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    labelPlural: 'Calendar',
    options: [{ id: 'has-calendar-invite', label: 'Has Calendar Invite' }],
    multiple: false,
  },
];

const TASKS_FILTER_CATEGORIES: FilterCategory[] = [
  {
    id: 'task_status',
    label: 'Status',
    labelPlural: 'Statuses',
    options: [
      {
        id: 'task-not-started',
        label: 'Not Started',
        icon: () => (
          <PropertyValueIcon
            optionId={PROPERTY_OPTION_IDS.STATUS.NOT_STARTED}
            class="size-3.5"
          />
        ),
      },
      {
        id: 'task-in-progress',
        label: 'In Progress',
        icon: () => (
          <PropertyValueIcon
            optionId={PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS}
            class="size-3.5"
          />
        ),
      },
      {
        id: 'task-in-review',
        label: 'In Review',
        icon: () => (
          <PropertyValueIcon
            optionId={PROPERTY_OPTION_IDS.STATUS.IN_REVIEW}
            class="size-3.5"
          />
        ),
      },
      {
        id: 'task-completed',
        label: 'Completed',
        icon: () => (
          <PropertyValueIcon
            optionId={PROPERTY_OPTION_IDS.STATUS.COMPLETED}
            class="size-3.5"
          />
        ),
      },
      {
        id: 'task-canceled',
        label: 'Canceled',
        icon: () => (
          <PropertyValueIcon
            optionId={PROPERTY_OPTION_IDS.STATUS.CANCELED}
            class="size-3.5"
          />
        ),
      },
    ],
    multiple: true,
  },
  {
    id: 'task_priority',
    label: 'Priority',
    labelPlural: 'Priorities',
    options: [
      {
        id: 'task-urgent',
        label: 'Urgent',
        icon: () => (
          <PropertyValueIcon
            optionId={PROPERTY_OPTION_IDS.PRIORITY.URGENT}
            class="size-3.5"
          />
        ),
      },
      {
        id: 'task-high-priority',
        label: 'High Priority',
        icon: () => (
          <PropertyValueIcon
            optionId={PROPERTY_OPTION_IDS.PRIORITY.HIGH}
            class="size-3.5"
          />
        ),
      },
      {
        id: 'task-medium-priority',
        label: 'Medium Priority',
        icon: () => (
          <PropertyValueIcon
            optionId={PROPERTY_OPTION_IDS.PRIORITY.MEDIUM}
            class="size-3.5"
          />
        ),
      },
      {
        id: 'task-low-priority',
        label: 'Low Priority',
        icon: () => (
          <PropertyValueIcon
            optionId={PROPERTY_OPTION_IDS.PRIORITY.LOW}
            class="size-3.5"
          />
        ),
      },
      { id: 'task-no-priority', label: 'No Priority' },
    ],
    multiple: true,
  },
];

const DOCUMENTS_FILTER_CATEGORIES: FilterCategory[] = [
  {
    id: 'type',
    label: 'Type',
    labelPlural: 'Types',
    options: [
      {
        id: 'doc-markdown',
        label: 'Markdown',
        icon: () => <EntityIcon targetType="md" size="xs" />,
      },
      {
        id: 'doc-canvas',
        label: 'Canvas',
        icon: () => <EntityIcon targetType="canvas" size="xs" />,
      },
      {
        id: 'file-code',
        label: 'Code',
        icon: () => <EntityIcon targetType="code" size="xs" />,
      },
      {
        id: 'file-image',
        label: 'Images',
        icon: () => <EntityIcon targetType="image" size="xs" />,
      },
      {
        id: 'file-pdf',
        label: 'PDFs',
        icon: () => <EntityIcon targetType="pdf" size="xs" />,
      },
      {
        id: 'file-docx',
        label: 'DOCX',
        icon: () => <EntityIcon targetType="write" size="xs" />,
      },
      {
        id: 'file-video',
        label: 'Videos',
        icon: () => <EntityIcon targetType="video" size="xs" />,
      },
      {
        id: 'doc-snippet',
        label: 'Snippets',
        icon: () => <EntityIcon targetType="snippet" size="xs" />,
      },
      {
        id: 'file-other',
        label: 'Other',
        icon: () => <EntityIcon targetType="files" size="xs" />,
      },
    ],
    multiple: true,
  },
];

// The Customers view's Stage and Owner filters are rendered as dynamic
// submenus (team-customizable deal stages via `useDealStages`, owners from
// contacts), not static categories — see unified-filter-dropdown.
export const VIEW_FACETS: Record<ListView, FilterCategory[]> = {
  inbox: INBOX_FILTER_CATEGORIES,
  agents: [],
  mail: MAIL_FILTER_CATEGORIES,
  documents: DOCUMENTS_FILTER_CATEGORIES,
  tasks: TASKS_FILTER_CATEGORIES,
  companies: [],
  channels: [],
  calls: [],
  folders: [],
  search: [],
};
