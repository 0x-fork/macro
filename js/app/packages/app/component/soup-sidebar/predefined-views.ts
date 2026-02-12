import type { FilterID } from '@app/component/next-soup/filters/filters';
import type { SystemSortOption } from '@app/component/next-soup/soup-view/sort-options';
import type { Component, JSX } from 'solid-js';

import WideSignal from '@macro-icons/wide/signal.svg';
import WideEmail from '@macro-icons/wide/email.svg';
import WideTask from '@macro-icons/wide/task.svg';
import WideStar from '@macro-icons/wide/star.svg';
import WideNoise from '@macro-icons/wide/noise.svg';
import WideFileMd from '@macro-icons/wide/file-md.svg';
import WideChat from '@macro-icons/wide/chat.svg';
import WideUser from '@macro-icons/wide/user.svg';
import WideFolder from '@macro-icons/wide/folder.svg';

/**
 * Configuration for a predefined view in the sidebar.
 * Each view has a set of filters and sort options that are applied when selected.
 */
export interface PredefinedView {
  /** Unique identifier for the view */
  readonly id: string;
  /** Display name shown in the sidebar */
  readonly label: string;
  /** Keyboard shortcut (single key) */
  readonly shortcut?: string;
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
 * These match the filter buttons in the current soup toolbar.
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
    id: 'briefing2',
    label: 'Briefing 2',
    icon: WideStar,
    filters: [],
    description: 'Briefing with scratch pad',
  },
  {
    id: 'inbox',
    label: 'Inbox',
    shortcut: 'i',
    icon: WideSignal,
    filters: ['signal', 'not-done'],
    sort: 'updated_at',
    description: 'Items requiring attention',
  },
  {
    id: 'other',
    label: 'Other',
    shortcut: 'o',
    icon: WideNoise,
    filters: ['noise', 'not-done'],
    sort: 'updated_at',
    description: 'Low priority items',
  },

  // ============ ENTITY TYPE FILTERS ============
  // These match the entity type buttons in the toolbar
  {
    id: 'docs',
    label: 'Docs',
    shortcut: 'd',
    icon: WideFileMd,
    filters: ['document'],
    sort: 'updated_at',
    description: 'Documents and notes',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    shortcut: 't',
    icon: WideTask,
    filters: ['task'],
    sort: 'updated_at',
    description: 'All tasks',
  },
  {
    id: 'mail',
    label: 'Mail',
    shortcut: 'l',
    icon: WideEmail,
    filters: ['email'],
    sort: 'updated_at',
    description: 'Email messages',
  },
  {
    id: 'people',
    label: 'People',
    shortcut: 'p',
    icon: WideUser,
    filters: ['people'],
    sort: 'updated_at',
    description: 'Direct messages',
  },
  {
    id: 'teams',
    label: 'Teams',
    shortcut: 'm',
    icon: WideChat,
    filters: ['teams'],
    sort: 'updated_at',
    description: 'Team channels',
  },
  {
    id: 'agents',
    label: 'Agents',
    shortcut: 'a',
    icon: WideStar,
    filters: ['agent'],
    sort: 'updated_at',
    description: 'AI agent conversations',
  },
  {
    id: 'files',
    label: 'Files',
    shortcut: 'f',
    icon: WideFolder,
    filters: ['file'],
    sort: 'updated_at',
    description: 'Uploaded files',
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
    viewIds: ['briefing', 'briefing2', 'inbox'],
  },
  {
    id: 'views',
    label: 'Views',
    viewIds: ['other', 'docs', 'tasks', 'mail', 'people', 'teams', 'agents', 'files'],
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
