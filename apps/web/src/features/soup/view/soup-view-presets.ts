import type { ListView } from '@app/constants/list-views';
import type { SoupEmailView } from '@app/features/soup/collection';
import {
  defineClause,
  type Facet,
  type FacetOption,
  type FacetSelection,
  NIL_UUID,
  type WhereBag,
} from '@app/features/soup/filtering/facet-store';
import { type FacetCtx, facet } from '@app/features/soup/filtering/facets/base';
import {
  ENABLE_SNIPPETS,
  ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_OVERRIDE,
} from '@core/constant/featureFlags';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { startOfDay, subWeeks } from 'date-fns';

export type SoupViewPreset = {
  initialFacets?: FacetSelection;
  facets?: readonly Facet<FacetCtx>[];
  emailView?: SoupEmailView;
  groupBy?: string;
};

// Tab preset configuration types
export type PresetContext = {
  userId: string | undefined;
  isNewInbox?: boolean;
  /** True iff the current user has admin/owner team role. Drives
   * visibility of admin-only tabs (e.g. companies → hidden). */
  isTeamAdmin: boolean;
};

// Default statuses for the open-task tabs; keep the ids and include props in sync.
const OPEN_TASK_STATUS_FILTER_IDS: string[] = [
  'task-not-started',
  'task-in-progress',
  'task-in-review',
];

const getExcludedDocumentSubTypes = (...subTypes: string[]) =>
  ENABLE_SNIPPETS() ? subTypes : [...subTypes, 'snippet'];

// Snippet docs stay hidden until the feature flag ships; exclude them from
// views that would otherwise surface them.
const excludeSnippets = (): WhereBag =>
  ENABLE_SNIPPETS() ? {} : { subType: { not: 'snippet' } };

type TabSpec = {
  emailView?: SoupEmailView;
  /** Facets to activate for this tab */
  initialFacets?: FacetSelection;
  groupBy?: string | ((ctx: PresetContext) => string | undefined);
  /** Tab is hidden (resolver returns `undefined`) when this returns false. */
  requires?: (ctx: PresetContext) => boolean;
};

export type ViewConfig = {
  default: string;
  /**
   * The view's facet(s), defined alongside `default`/`tabs` with the tab
   * clauses inline in the options. A builder (not a static array) because the
   * clauses read `ctx` (e.g. `userId`, `email`).
   */
  facets: (ctx: PresetContext) => readonly Facet<FacetCtx>[];
  tabs: Record<string, TabSpec>;
};

const defineViewFacet = (
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
      return defineViewFacet('inbox', [
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
            channelIsParticipant: true,
            channelThreadDone: false,
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
            channelThreadDone: false,
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
              threadId: { not: NIL_UUID },
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
      signal: {
        emailView: 'inbox',
        initialFacets: { focus: ['inbox'] },
        groupBy: (ctx) => (ctx.isNewInbox ? 'date' : undefined),
      },
      noise: {
        emailView: 'inbox',
        initialFacets: { focus: ['noise'] },
        groupBy: (ctx) => (ctx.isNewInbox ? 'date' : undefined),
      },
      all: {
        emailView: 'all',
        initialFacets: { focus: ['explicit-noise'] },
        groupBy: (ctx) => (ctx.isNewInbox ? 'date' : undefined),
      },
    },
  },
  agents: {
    default: 'owned',
    facets: (ctx) =>
      defineViewFacet('agents', [
        {
          id: 'owned',
          clause: defineClause({ chatOwnerId: ctx.userId }),
        },
        {
          id: 'running',
          clause: defineClause({ chatOwnerId: ctx.userId }),
        },
        {
          id: 'shared',
          clause: defineClause({ chatOwnerId: { not: ctx.userId as string } }),
        },
        {
          id: 'automations',
          clause: defineClause({}),
          predicate: (entity) => entity.type === 'automation',
        },
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
    facets: () =>
      defineViewFacet('mail', [
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
          clause: defineClause({ threadId: { not: NIL_UUID } }),
        },
        // No sender filter: the 'sent' view already scopes to messages with
        // is_sent = TRUE per linked inbox, which covers multi-inbox correctly
        // (a single sender address would drop secondary inboxes' sent mail).
        {
          id: 'sent',
          clause: defineClause({ $clause: (b) => ({ ef: b.and() }) }),
        },
        { id: 'shared', clause: defineClause({ emailShared: 'only' }) },
        {
          id: 'all',
          clause: defineClause({ threadId: { not: NIL_UUID } }),
        },
      ]),
    tabs: {
      important: {
        emailView: 'inbox',
        initialFacets: { scope: ['email'], drafts: ['no-drafts'] },
        groupBy: 'date',
      },
      noise: {
        emailView: 'inbox',
        initialFacets: { scope: ['email'], drafts: ['no-drafts'] },
        groupBy: 'date',
      },
      calendar: {
        emailView: 'all',
        initialFacets: { scope: ['email'], drafts: ['no-drafts'] },
        groupBy: 'date',
      },
      drafts: {
        emailView: 'drafts',
        initialFacets: { drafts: ['email-drafts'] },
        groupBy: 'date',
      },
      sent: {
        emailView: 'sent',
        initialFacets: { scope: ['email'], drafts: ['no-drafts'] },
        groupBy: 'date',
      },
      shared: {
        emailView: 'all',
        initialFacets: { scope: ['email'], ownership: ['shared-entity'] },
        groupBy: 'date',
      },
      all: {
        emailView: 'all',
        initialFacets: { scope: ['email'] },
        groupBy: 'date',
      },
    },
  },
  documents: {
    default: 'owned',
    facets: (ctx) =>
      defineViewFacet('documents', [
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
      defineViewFacet('tasks', [
        {
          id: 'assigned-to-me',
          clause: defineClause({
            subType: 'task',
            $clause: (b) => ({
              propf: b.eq('properties', {
                propertyId: SYSTEM_PROPERTY_IDS.ASSIGNEES,
                type: 'entity' as const,
                value: ctx.userId as string,
              }),
            }),
          }),
        },
        {
          id: 'created-by-me',
          clause: defineClause({
            subType: 'task',
            documentOwnerId: ctx.userId as string,
          }),
        },
        { id: 'all', clause: defineClause({ subType: 'task' }) },
      ]),
    tabs: {
      'assigned-to-me': {
        initialFacets: {
          scope: ['task'],
          ownership: ['assigned-to'],
          task_status: [...OPEN_TASK_STATUS_FILTER_IDS],
        },
        groupBy: `property:${SYSTEM_PROPERTY_IDS.PRIORITY}`,
        requires: (c) => !!c.userId,
      },
      'created-by-me': {
        initialFacets: {
          scope: ['task'],
          ownership: ['owned-entity'],
          task_status: [...OPEN_TASK_STATUS_FILTER_IDS],
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
      defineViewFacet('channels', [
        {
          id: 'recent',
          clause: defineClause({
            channelImportance: true,
            channelIsParticipant: true,
          }),
        },
        {
          id: 'people',
          clause: defineClause({ channelType: 'direct_message' }),
        },
        {
          id: 'teams',
          clause: defineClause({
            channelType: { not: 'direct_message' },
            $clause: (b) => ({
              chanf: b.or(
                b.eq('channelIsParticipant', true),
                b.eq('channelIsParticipant', false)
              ),
            }),
          }),
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
      defineViewFacet('calls', [
        { id: 'all', clause: defineClause({ callId: { not: NIL_UUID } }) },
        {
          id: 'missed',
          clause: defineClause({ callStatus: 'MISSED' }),
        },
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
      defineViewFacet('companies', [
        { id: 'active', clause: defineClause({ crmCompanyHidden: false }) },
        { id: 'hidden', clause: defineClause({ crmCompanyHidden: true }) },
      ]),
    tabs: {
      active: {
        initialFacets: { scope: ['crm-company-active'] },
        groupBy: `property:${SYSTEM_PROPERTY_IDS.STAGE}`,
      },
      // Admin/owner only — the BE rejects `hidden: true` from non-admins
      // with 403, so the tab is hidden for them.
      hidden: {
        initialFacets: { scope: ['crm-company-hidden'] },
        requires: (c) => c.isTeamAdmin,
        groupBy: `property:${SYSTEM_PROPERTY_IDS.STAGE}`,
      },
    },
  },
  folders: {
    default: 'owned',
    facets: (ctx) =>
      defineViewFacet('folders', [
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
      defineViewFacet('search', [
        {
          id: 'all',
          clause: defineClause(
            {
              foreignEntityRecordId: NIL_UUID,
              crmCompanyId: NIL_UUID,
              channelThreadId: NIL_UUID,
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
): SoupViewPreset | undefined;

/** Overload: views that require user context */
export function getViewPreset(
  view: ContextRequiredView,
  tab: string | undefined,
  ctx: PresetContext
): SoupViewPreset | undefined;

/** Overload: any view with context */
export function getViewPreset(
  view: ListView,
  tab: string | undefined,
  ctx: PresetContext
): SoupViewPreset | undefined;

export function getViewPreset(
  view: ListView,
  tab?: string,
  ctx?: PresetContext
): SoupViewPreset | undefined {
  const config = VIEW_TAB_PRESETS[view];
  if (!config) return undefined;

  const presetCtx: PresetContext = ctx ?? {
    userId: undefined,
    isTeamAdmin: false,
    isNewInbox: false,
  };

  // The preset for one tab, or undefined when the tab is hidden for `ctx`.
  const build = (tabId: string): SoupViewPreset | undefined => {
    const spec = config.tabs[tabId];
    if (!spec || (spec.requires && !spec.requires(presetCtx))) return undefined;
    const groupBy =
      typeof spec.groupBy === 'function'
        ? spec.groupBy(presetCtx)
        : spec.groupBy;
    return {
      ...(spec.emailView ? { emailView: spec.emailView } : {}),
      facets: config.facets(presetCtx),
      initialFacets: { ...spec.initialFacets, [view]: [tabId] },
      ...(groupBy ? { groupBy } : {}),
    };
  };

  if (tab !== undefined) return build(tab);

  // Use the default tab when available, otherwise the first tab allowed by the
  // current context.
  return (
    build(config.default) ?? Object.keys(config.tabs).map(build).find(Boolean)
  );
}
