import type { FilterID } from '@app/component/next-soup/filters';
import {
  clause,
  defineClause,
  type Facet,
  type FacetOption,
  type FacetSelection,
  type WhereBag,
} from '@app/component/next-soup/filters/facet-store';
import {
  type FacetCtx,
  facet,
} from '@app/component/next-soup/filters/facets/base';
import {
  NIL_UUID,
  type Query,
} from '@app/component/next-soup/filters/filter-store';
import type { ListView } from '@app/constants/list-views';
import {
  ENABLE_SNIPPETS,
  ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_OVERRIDE,
} from '@core/constant/featureFlags';
import { PROPERTY_OPTION_IDS, SYSTEM_PROPERTY_IDS } from '@property/constants';
import { startOfDay, subWeeks } from 'date-fns';

type EmailView = NonNullable<Query['emailView']>;

type SoupFiltersPreset = {
  /** Filter data for server query */
  filters: Query;
  /** Client filters to apply (legacy predicates; migrating to `initialFacets`) */
  clientFilters: { and?: FilterID[]; or?: FilterID[] };
  /** Facet selection to seed for this tab (preset-owned facets). */
  initialFacets?: FacetSelection;
  /**
   * Inline facet definitions for this tab's Facet — facets used here that
   * don't live in the shared catalog (`ALL_FACETS`). Handed to the store via
   * `setExtraFacets` so they participate in compile/test like catalog facets.
   */
  facets?: readonly Facet<FacetCtx>[];
  /**
   * Initial group-by to apply when this tab is selected. Uses the same id
   * format consumed by `soup.grouping.setActiveGroupId` (e.g. `date`,
   * `entity_type`, `project`, or `property:<definition-id>`).
   */
  groupBy?: string;
};

// Tab preset configuration types
export type PresetContext = {
  userId: string | undefined;
  email: string | undefined;
  /** True iff the current user has admin/owner team role. Drives
   * visibility of admin-only tabs (e.g. companies → hidden). */
  isTeamAdmin: boolean;
};

// Default statuses for the open-task tabs; keep the ids and include props in sync.
const OPEN_TASK_STATUS_FILTER_IDS: FilterID[] = [
  'task-not-started',
  'task-in-progress',
  'task-in-review',
];

const OPEN_TASK_STATUS_INCLUDE_PROPS = [
  {
    propertyId: SYSTEM_PROPERTY_IDS.STATUS,
    type: 'select' as const,
    value: PROPERTY_OPTION_IDS.STATUS.NOT_STARTED,
  },
  {
    propertyId: SYSTEM_PROPERTY_IDS.STATUS,
    type: 'select' as const,
    value: PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS,
  },
  {
    propertyId: SYSTEM_PROPERTY_IDS.STATUS,
    type: 'select' as const,
    value: PROPERTY_OPTION_IDS.STATUS.IN_REVIEW,
  },
];

const getExcludedDocumentSubTypes = (...subTypes: string[]) =>
  ENABLE_SNIPPETS() ? subTypes : [...subTypes, 'snippet'];

// Snippet docs stay hidden until the feature flag ships; exclude them from
// views that would otherwise surface them.
const excludeSnippets = (): WhereBag =>
  ENABLE_SNIPPETS() ? {} : { subType: { not: 'snippet' } };

// The open-task status property filters, shared by the task tabs.
const openStatusExprs = OPEN_TASK_STATUS_INCLUDE_PROPS.map((p) =>
  clause.eq('properties', p)
);

type TabSpec = {
  emailView?: EmailView;
  /** Catalog facet seeds for this tab, WITHOUT the `{ [view]: [tab] }` entry. */
  initialFacets?: FacetSelection;
  groupBy?: string;
  /** Tab is hidden (resolver returns `undefined`) when this returns false. */
  requires?: (ctx: PresetContext) => boolean;
};

type ViewConfig = {
  default: string;
  /**
   * The view's facet(s), defined alongside `default`/`tabs` with the tab
   * clauses inline in the options. A builder (not a static array) because the
   * clauses read `ctx` (e.g. `userId`, `email`).
   */
  facets: (ctx: PresetContext) => readonly Facet<FacetCtx>[];
  tabs: Record<string, TabSpec>;
};

// A single-select facet for a view; its options carry the tab clauses.
const viewFacet = (
  id: ListView,
  options: readonly FacetOption<FacetCtx>[]
): readonly Facet<FacetCtx>[] => [
  facet({ id, mode: 'or', multiple: false, options }),
];

export const VIEW_TAB_PRESETS: Record<ListView, ViewConfig> = {
  inbox: {
    default: 'signal',
    facets: () => {
      const cutoff = subWeeks(startOfDay(new Date()), 2).toISOString();
      return viewFacet('inbox', [
        {
          id: 'signal',
          clause: defineClause({
            documentDone: false,
            documentUpdatedAt: { gte: cutoff },
            ...excludeSnippets(),
            emailDone: false,
            emailImportance: true,
            emailShared: 'exclude',
            emailUpdatedAt: { gte: cutoff },
            channelDone: false,
            chatDone: false,
            chatUpdatedAt: { gte: cutoff },
            folderDone: false,
            folderUpdatedAt: { gte: cutoff },
            foreignEntitySource: 'github_pull_request',
            foreignEntityDone: false,
            foreignEntityIncludesMe: true,
          }),
        },
        {
          id: 'noise',
          clause: defineClause({
            documentDone: false,
            ...excludeSnippets(),
            emailDone: false,
            emailImportance: false,
            emailShared: 'exclude',
            channelDone: false,
            chatDone: false,
            folderDone: false,
          }),
        },
        {
          id: 'all',
          clause: defineClause(
            {
              crmCompanyId: NIL_UUID,
              documentId: { not: NIL_UUID },
              ...excludeSnippets(),
              $clause: (b) => ({ ef: b.and() }),
              channelId: { not: NIL_UUID },
              chatId: { not: NIL_UUID },
              folderId: { not: NIL_UUID },
              foreignEntityIncludesMe: true,
              ...(ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_OVERRIDE
                ? {
                    foreignEntitySource: 'github_pull_request',
                    foreignEntityRecordId: { not: NIL_UUID },
                  }
                : {}),
            },
            { restrict: false }
          ),
        },
      ]);
    },
    tabs: {
      signal: { emailView: 'inbox', initialFacets: { focus: ['inbox'] } },
      noise: { emailView: 'inbox', initialFacets: { focus: ['noise'] } },
      all: { emailView: 'all', initialFacets: { focus: ['explicit-noise'] } },
    },
  },
  agents: {
    default: 'owned',
    facets: (ctx) =>
      viewFacet('agents', [
        { id: 'owned', clause: defineClause({ chatOwnerId: ctx.userId }) },
        { id: 'running', clause: defineClause({ chatOwnerId: ctx.userId }) },
        {
          id: 'shared',
          clause: defineClause({ chatOwnerId: { not: ctx.userId as string } }),
        },
        { id: 'automations', clause: defineClause({}) },
      ]),
    tabs: {
      owned: {
        initialFacets: { scope: ['agent'] },
        requires: (c) => !!c.userId,
      },
      running: {
        initialFacets: { scope: ['agent'], ownership: ['owned-entity'] },
        requires: (c) => !!c.userId,
      },
      shared: {
        initialFacets: { scope: ['agent'], ownership: ['shared-entity'] },
        requires: (c) => !!c.userId,
      },
      automations: { initialFacets: { scope: ['automation'] } },
    },
  },
  mail: {
    default: 'important',
    facets: (ctx) =>
      viewFacet('mail', [
        {
          id: 'important',
          clause: defineClause({
            emailImportance: true,
            emailShared: 'exclude',
          }),
        },
        {
          id: 'noise',
          clause: defineClause({
            emailImportance: false,
            emailShared: 'exclude',
          }),
        },
        {
          id: 'calendar',
          clause: defineClause({
            emailShared: 'exclude',
            emailCalendarOnly: true,
          }),
        },
        {
          id: 'drafts',
          clause: defineClause({ $clause: (b) => ({ ef: b.and() }) }),
        },
        { id: 'sent', clause: defineClause({ emailSender: ctx.email }) },
        { id: 'shared', clause: defineClause({ emailShared: 'only' }) },
        {
          id: 'all',
          clause: defineClause({ $clause: (b) => ({ ef: b.and() }) }),
        },
      ]),
    tabs: {
      important: {
        emailView: 'inbox',
        initialFacets: { scope: ['email'], drafts: ['no-drafts'] },
      },
      noise: {
        emailView: 'inbox',
        initialFacets: { scope: ['email'], drafts: ['no-drafts'] },
      },
      calendar: {
        emailView: 'all',
        initialFacets: { scope: ['email'], drafts: ['no-drafts'] },
      },
      drafts: {
        emailView: 'drafts',
        initialFacets: { drafts: ['email-drafts'] },
      },
      sent: {
        emailView: 'sent',
        initialFacets: { scope: ['email'], drafts: ['no-drafts'] },
        requires: (c) => !!c.email,
      },
      shared: {
        emailView: 'all',
        initialFacets: { scope: ['email'], ownership: ['shared-entity'] },
      },
      all: { emailView: 'all', initialFacets: { scope: ['email'] } },
    },
  },
  documents: {
    default: 'owned',
    facets: (ctx) =>
      viewFacet('documents', [
        {
          id: 'owned',
          clause: defineClause({
            documentOwnerId: ctx.userId,
            isEmailAttachment: false,
            subType: { not: getExcludedDocumentSubTypes('task') },
          }),
        },
        {
          id: 'shared',
          clause: defineClause({
            isEmailAttachment: false,
            documentOwnerId: { not: ctx.userId as string },
            subType: { not: getExcludedDocumentSubTypes('task') },
          }),
        },
        {
          id: 'attachments',
          clause: defineClause({ isEmailAttachment: true }),
        },
        {
          id: 'folders',
          clause: defineClause({ folderId: { not: NIL_UUID } }),
        },
        {
          id: 'all',
          clause: defineClause({
            subType: { not: getExcludedDocumentSubTypes('task') },
          }),
        },
      ]),
    tabs: {
      owned: {
        initialFacets: {
          scope: ['document-or-file'],
          ownership: ['owned-entity'],
        },
        requires: (c) => !!c.userId,
      },
      shared: {
        initialFacets: {
          scope: ['document-or-file'],
          ownership: ['shared-entity'],
        },
        requires: (c) => !!c.userId,
      },
      attachments: { initialFacets: { scope: ['document-or-file'] } },
      folders: { initialFacets: { scope: ['folders'] } },
      all: { initialFacets: { scope: ['document-or-file'] } },
    },
  },
  tasks: {
    default: 'assigned-to-me',
    facets: (ctx) =>
      viewFacet('tasks', [
        {
          id: 'assigned-to-me',
          clause: defineClause({
            subType: 'task',
            $clause: (b) => ({
              propf: b.and(
                b.eq('properties', {
                  propertyId: SYSTEM_PROPERTY_IDS.ASSIGNEES,
                  type: 'entity' as const,
                  value: ctx.userId as string,
                }),
                b.or(...openStatusExprs)
              ),
            }),
          }),
        },
        {
          id: 'created-by-me',
          clause: defineClause({
            subType: 'task',
            documentOwnerId: ctx.userId as string,
            $clause: (b) => ({ propf: b.or(...openStatusExprs) }),
          }),
        },
        { id: 'all', clause: defineClause({ subType: 'task' }) },
      ]),
    tabs: {
      'assigned-to-me': {
        initialFacets: {
          scope: ['task'],
          ownership: ['assigned-to'],
          'task-status': [...OPEN_TASK_STATUS_FILTER_IDS],
        },
        groupBy: `property:${SYSTEM_PROPERTY_IDS.PRIORITY}`,
        requires: (c) => !!c.userId,
      },
      'created-by-me': {
        initialFacets: {
          scope: ['task'],
          ownership: ['owned-entity'],
          'task-status': [...OPEN_TASK_STATUS_FILTER_IDS],
        },
        groupBy: `property:${SYSTEM_PROPERTY_IDS.STATUS}`,
        requires: (c) => !!c.userId,
      },
      all: {
        initialFacets: { scope: ['task'] },
        groupBy: `property:${SYSTEM_PROPERTY_IDS.ASSIGNEES}`,
      },
    },
  },
  channels: {
    default: 'recent',
    facets: () =>
      viewFacet('channels', [
        { id: 'recent', clause: defineClause({ channelImportance: true }) },
        {
          id: 'people',
          clause: defineClause({ channelType: 'direct_message' }),
        },
        {
          id: 'teams',
          clause: defineClause({ channelType: { not: 'direct_message' } }),
        },
      ]),
    tabs: {
      recent: { initialFacets: { scope: ['channels'] } },
      people: { initialFacets: { scope: ['people'] } },
      teams: { initialFacets: { scope: ['teams'] } },
    },
  },
  calls: {
    default: 'all',
    facets: () =>
      viewFacet('calls', [
        { id: 'all', clause: defineClause({ callId: { not: NIL_UUID } }) },
        { id: 'missed', clause: defineClause({ callStatus: 'MISSED' }) },
        {
          id: 'unattended',
          clause: defineClause({ callStatus: 'UNATTENDED' }),
        },
      ]),
    tabs: {
      all: { initialFacets: { scope: ['calls'] } },
      missed: { initialFacets: { scope: ['calls'] } },
      unattended: { initialFacets: { scope: ['calls'] } },
    },
  },
  companies: {
    default: 'active',
    facets: () =>
      viewFacet('companies', [
        { id: 'active', clause: defineClause({ crmCompanyHidden: false }) },
        { id: 'hidden', clause: defineClause({ crmCompanyHidden: true }) },
      ]),
    tabs: {
      active: { initialFacets: { scope: ['crm-company-active'] } },
      // Admin/owner only — the BE rejects `hidden: true` from non-admins
      // with 403, so the tab is hidden for them.
      hidden: {
        initialFacets: { scope: ['crm-company-hidden'] },
        requires: (c) => c.isTeamAdmin,
      },
    },
  },
  folders: {
    default: 'owned',
    facets: (ctx) =>
      viewFacet('folders', [
        { id: 'owned', clause: defineClause({ folderOwnerId: ctx.userId }) },
        { id: 'all', clause: defineClause({ folderId: { not: NIL_UUID } }) },
      ]),
    tabs: {
      owned: {
        initialFacets: { scope: ['folders'], ownership: ['owned-entity'] },
        requires: (c) => !!c.userId,
      },
      all: { initialFacets: { scope: ['folders'] } },
    },
  },
  search: {
    default: 'all',
    facets: () =>
      viewFacet('search', [
        {
          id: 'all',
          clause: defineClause(
            {
              foreignEntityRecordId: NIL_UUID,
              crmCompanyId: NIL_UUID,
              ...excludeSnippets(),
            },
            { restrict: false }
          ),
        },
      ]),
    tabs: {
      // Search has no full-text index over foreign entities yet, so the
      // `search-supported` scope excludes them (and CRM rows) until it does.
      all: { initialFacets: { scope: ['search-supported'] } },
    },
  },
};

/** Views whose default tab requires user context */
type ContextRequiredView = 'agents' | 'documents' | 'tasks' | 'folders';

/** Views whose default tab works without user context */
type ContextOptionalView = Exclude<ListView, ContextRequiredView>;

/** Overload: views that don't require context */
export function getViewPreset(
  view: ContextOptionalView,
  tab?: string
): SoupFiltersPreset | undefined;

/** Overload: views that require user context */
export function getViewPreset(
  view: ContextRequiredView,
  tab: string | undefined,
  ctx: PresetContext
): SoupFiltersPreset | undefined;

/** Overload: any view with context */
export function getViewPreset(
  view: ListView,
  tab: string | undefined,
  ctx: PresetContext
): SoupFiltersPreset | undefined;

export function getViewPreset(
  view: ListView,
  tab?: string,
  ctx?: PresetContext
): SoupFiltersPreset | undefined {
  const config = VIEW_TAB_PRESETS[view];
  if (!config) return undefined;

  const presetCtx: PresetContext = ctx ?? {
    userId: undefined,
    email: undefined,
    isTeamAdmin: false,
  };

  // The preset for one tab, or undefined when the tab is hidden for `ctx`.
  const build = (tabId: string): SoupFiltersPreset | undefined => {
    const spec = config.tabs[tabId];
    if (!spec || (spec.requires && !spec.requires(presetCtx))) return undefined;
    return {
      filters: spec.emailView ? { emailView: spec.emailView } : {},
      clientFilters: {},
      facets: config.facets(presetCtx),
      initialFacets: { ...spec.initialFacets, [view]: [tabId] },
      ...(spec.groupBy ? { groupBy: spec.groupBy } : {}),
    };
  };

  // The requested (or default) tab, else the first tab that works with `ctx`.
  return (
    build(tab ?? config.default) ??
    Object.keys(config.tabs).map(build).find(Boolean)
  );
}
