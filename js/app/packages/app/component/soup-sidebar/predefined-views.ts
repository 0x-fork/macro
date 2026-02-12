import type { FilterID } from '@app/component/next-soup/filters/filters';
import type { SystemSortOption } from '@app/component/next-soup/soup-view/sort-options';
import type { Component, JSX } from 'solid-js';

import WideSignal from '@macro-icons/wide/signal.svg';
import WideEmail from '@macro-icons/wide/email.svg';
import WideTask from '@macro-icons/wide/task.svg';
import WideTaskDone from '@macro-icons/wide/task-done.svg';
import WideStar from '@macro-icons/wide/star.svg';
import WideNoise from '@macro-icons/wide/noise.svg';
import WideFileMd from '@macro-icons/wide/file-md.svg';
import WideChat from '@macro-icons/wide/chat.svg';
import WideUser from '@macro-icons/wide/user.svg';
import WidePriorityHigh from '@macro-icons/wide/priority-high.svg';
import WideTaskNotDone from '@macro-icons/wide/task-not-done.svg';

/**
 * Configuration for a predefined view in the sidebar.
 * Each view has a set of filters and sort options that are applied when selected.
 */
export interface PredefinedView {
  /** Unique identifier for the view */
  readonly id: string;
  /** Display name shown in the sidebar */
  readonly label: string;
  /** Icon component to display */
  readonly icon: Component<JSX.SvgSVGAttributes<SVGSVGElement>>;
  /** Main filter IDs to activate when this view is selected */
  readonly filters: FilterID[];
  /** Contextual filter IDs to activate (from contextual-filters.ts) */
  readonly contextualFilters?: readonly string[];
  /** Sort option to apply */
  readonly sort?: SystemSortOption;
  /** Description shown in tooltip */
  readonly description?: string;
  /** Whether this view requires current user ID for filtering */
  readonly requiresCurrentUser?: boolean;
}

/**
 * Predefined views for the soup sidebar.
 * Organized by user workflow rather than entity type.
 */
export const PREDEFINED_VIEWS: readonly PredefinedView[] = [
  // ============ TOP LEVEL ============
  {
    id: 'briefing',
    label: 'Briefing',
    icon: WideStar,
    filters: [],
    description: 'Your daily briefing',
  },
  {
    id: 'inbox',
    label: 'Inbox',
    icon: WideSignal,
    filters: ['not-done'],
    sort: 'updated_at',
    description: 'Items with outstanding notifications',
  },

  // ============ TASK VIEWS ============
  // For managing tasks

  {
    id: 'my-tasks',
    label: 'My Tasks',
    icon: WideTask,
    filters: ['task'],
    contextualFilters: ['task-assigned-to-me', 'task-open'],
    sort: 'updated_at',
    description: 'Tasks assigned to you',
    requiresCurrentUser: true,
  },
  {
    id: 'all-tasks',
    label: 'All Tasks',
    icon: WideTaskNotDone,
    filters: ['task'],
    contextualFilters: ['task-open'],
    sort: 'updated_at',
    description: 'All open tasks',
  },
  {
    id: 'completed-tasks',
    label: 'Completed',
    icon: WideTaskDone,
    filters: ['task'],
    contextualFilters: ['task-completed'],
    sort: 'updated_at',
    description: 'Completed tasks',
  },
  {
    id: 'urgent-tasks',
    label: 'Urgent',
    icon: WidePriorityHigh,
    filters: ['task'],
    contextualFilters: ['task-high-or-urgent'],
    sort: 'updated_at',
    description: 'High priority and urgent tasks',
  },

  // ============ EMAIL VIEWS ============
  // For managing emails

  {
    id: 'all-mail',
    label: 'All Mail',
    icon: WideEmail,
    filters: ['email'],
    sort: 'updated_at',
    description: 'All emails',
  },
  {
    id: 'unread-mail',
    label: 'Unread Mail',
    icon: WideEmail,
    filters: ['email'],
    contextualFilters: ['email-unread'],
    sort: 'updated_at',
    description: 'Unread emails',
  },
  {
    id: 'important-mail',
    label: 'Important Mail',
    icon: WidePriorityHigh,
    filters: ['email'],
    contextualFilters: ['email-important'],
    sort: 'updated_at',
    description: 'Important emails',
  },
  {
    id: 'drafts',
    label: 'Drafts',
    icon: WideEmail,
    filters: ['email'],
    contextualFilters: ['email-draft'],
    sort: 'updated_at',
    description: 'Draft emails',
  },

  // ============ DOCUMENT VIEWS ============
  // For managing documents

  {
    id: 'all-docs',
    label: 'All Docs',
    icon: WideFileMd,
    filters: ['document'],
    sort: 'updated_at',
    description: 'All documents',
  },
  {
    id: 'recent-docs',
    label: 'Recent Docs',
    icon: WideFileMd,
    filters: ['document'],
    contextualFilters: ['doc-recent'],
    sort: 'updated_at',
    description: 'Recently edited documents',
  },

  // ============ PEOPLE VIEWS ============
  // For collaboration

  {
    id: 'messages',
    label: 'Messages',
    icon: WideChat,
    filters: ['teams-and-people'],
    sort: 'updated_at',
    description: 'All conversations',
  },
  {
    id: 'direct-messages',
    label: 'Direct Messages',
    icon: WideUser,
    filters: ['people'],
    sort: 'updated_at',
    description: 'Direct message conversations',
  },
  {
    id: 'team-channels',
    label: 'Team Channels',
    icon: WideChat,
    filters: ['teams'],
    sort: 'updated_at',
    description: 'Team and group channels',
  },

  // ============ OTHER VIEWS ============

  {
    id: 'agents',
    label: 'Agents',
    icon: WideStar,
    filters: ['agent'],
    sort: 'updated_at',
    description: 'AI agent conversations',
  },
  {
    id: 'low-priority',
    label: 'Low Priority',
    icon: WideNoise,
    filters: ['explicit-noise'],
    sort: 'updated_at',
    description: 'Low priority items',
  },
] as const;

/**
 * Group configuration for organizing views in the sidebar
 */
export interface ViewGroup {
  readonly id: string;
  readonly label: string;
  readonly viewIds: readonly string[];
}

/**
 * Groups for organizing views in the sidebar
 */
export const VIEW_GROUPS: readonly ViewGroup[] = [
  {
    id: 'top',
    label: '',
    viewIds: ['briefing', 'inbox'],
  },
  {
    id: 'views',
    label: 'Views',
    viewIds: [
      'my-tasks', 'all-tasks', 'completed-tasks', 'urgent-tasks',
      'all-mail', 'unread-mail', 'important-mail', 'drafts',
      'all-docs', 'recent-docs',
      'messages', 'direct-messages', 'team-channels',
      'agents', 'low-priority',
    ],
  },
] as const;

/**
 * Get a predefined view by ID
 */
export const getViewById = (id: string): PredefinedView | undefined => {
  return PREDEFINED_VIEWS.find((view) => view.id === id);
};

/**
 * Get views for a specific group
 */
export const getViewsForGroup = (groupId: string): PredefinedView[] => {
  const group = VIEW_GROUPS.find((g) => g.id === groupId);
  if (!group) return [];
  return group.viewIds
    .map((id) => getViewById(id))
    .filter((v): v is PredefinedView => v !== undefined);
};
