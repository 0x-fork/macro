import {
  agentFilter,
  automationFilter,
  callsFilter,
  channelsFilter,
  crmCompanyActiveFilter,
  crmCompanyHiddenFilter,
  emailFilter,
  peopleFilter,
  projectFilter,
  searchSupportedFilter,
  sharedEntity,
  taskAssignedToUserFilter,
  taskFilter,
  teamsFilter,
} from '../predicates';
import { facet } from './base';

// Entity-type scope a view confines to (predicate-only; backend scope is in the
// preset query). Distinct from ENTITY_TYPE, which carries restrict clauses.
export const SCOPE = facet({
  id: 'scope',
  mode: 'or',
  multiple: false,
  options: [
    { id: 'email', predicate: (e) => emailFilter(e) },
    { id: 'agent', predicate: (e) => agentFilter(e) },
    { id: 'automation', predicate: (e) => automationFilter(e) },
    { id: 'people', predicate: (e) => peopleFilter(e) },
    { id: 'teams', predicate: (e) => teamsFilter(e) },
    { id: 'task', predicate: (e) => taskFilter(e) },
    { id: 'channels', predicate: (e) => channelsFilter(e) },
    { id: 'folders', predicate: (e) => projectFilter(e) },
    { id: 'calls', predicate: (e) => callsFilter(e) },
    {
      id: 'document-or-file',
      predicate: (e) => e.type === 'document' && !taskFilter(e),
    },
    { id: 'crm-company-active', predicate: (e) => crmCompanyActiveFilter(e) },
    { id: 'crm-company-hidden', predicate: (e) => crmCompanyHiddenFilter(e) },
    { id: 'search-supported', predicate: (e) => searchSupportedFilter(e) },
  ],
});

// Relationship to the current user
export const OWNERSHIP = facet({
  id: 'ownership',
  mode: 'or',
  multiple: false,
  options: [
    {
      id: 'owned-entity',
      predicate: (e, ctx) => !sharedEntity(() => ctx.userId)(e),
    },
    {
      id: 'shared-entity',
      predicate: (e, ctx) => sharedEntity(() => ctx.userId)(e),
    },
    {
      id: 'assigned-to',
      predicate: (e, ctx) => taskAssignedToUserFilter(() => ctx.userId)(e),
    },
  ],
});
