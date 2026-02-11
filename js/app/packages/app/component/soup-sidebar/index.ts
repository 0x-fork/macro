// Main components
export { SoupWithSidebar } from './SoupWithSidebar';
export { SoupSidebar } from './SoupSidebar';
export { SoupFilterToolbar } from './SoupFilterToolbar';
export { FilterDropdown, type FilterOption } from './FilterDropdown';

// Predefined views configuration
export {
  PREDEFINED_VIEWS,
  VIEW_GROUPS,
  getViewById,
  getViewsForGroup,
  type PredefinedView,
  type ViewGroup,
} from './predefined-views';

// Contextual filters
export {
  type ContextualFilter,
  EMAIL_CONTEXTUAL_FILTERS,
  TASK_CONTEXTUAL_FILTERS,
  TASK_STATUS_FILTERS,
  TASK_PRIORITY_FILTERS,
  TASK_ASSIGNEE_FILTERS,
  TASK_DUE_DATE_FILTERS,
  TASK_STRUCTURE_FILTERS,
  DOCUMENT_CONTEXTUAL_FILTERS,
  CHANNEL_CONTEXTUAL_FILTERS,
  CHAT_CONTEXTUAL_FILTERS,
  GENERAL_CONTEXTUAL_FILTERS,
  ALL_CONTEXTUAL_FILTERS,
  getContextualFiltersForActiveFilters,
  applyContextualFilter,
  countMatchingEntities,
  createAssignedToMeFilter,
} from './contextual-filters';

// Property-based filter utilities
export {
  // Assignee helpers
  hasProperties,
  getPropertyById,
  getAssigneeIds,
  hasAssignees,
  isAssignedTo,
  isUnassigned,
  // Status helpers
  getStatusOptionId,
  hasStatus,
  isNotStarted,
  isInProgress,
  isInReview,
  isCompleted,
  isCanceled,
  isClosed,
  isOpen,
  // Priority helpers
  getPriorityOptionId,
  hasPriority,
  isUrgentPriority,
  isHighPriority,
  isMediumPriority,
  isLowPriority,
  isHighOrUrgentPriority,
  hasNoPriority,
  // Due date helpers
  getDueDate,
  hasDueDate,
  hasNoDueDate,
  isOverdue,
  isDueToday,
  isDueThisWeek,
  isDueSoon,
  // Task structure helpers
  hasParentTask,
  hasSubtasks,
  isSubtask,
  isRootTask,
} from './property-filter-utils';
