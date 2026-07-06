import type { NotificationSource } from '@notifications';
import { clause, type Facet, type OptionClause } from '../facet-store';

export type { Facet, FacetOption } from '../facet-store';

export type FacetCtx = {
  userId?: string;
  assignees?: string[];
  // some preset predicates (focus/unread) test notification state
  notificationSource?: NotificationSource;
  // tag option id → owning property-definition id, so the tag facet can build
  // its `propf` clause (option ids are unique but the backend literal needs the
  // definition). Absent/unloaded options compile to no clause.
  tagDefs?: ReadonlyMap<string, string>;
};

// Define facet helper with typed context
export const facet = <const F extends Facet<FacetCtx>>(def: F): F => def;

// must match the id the dropdown/drawer send
export const NO_ASSIGNEE = 'NO_ASSIGNEE';

// property-clause shortcuts (target propf)
export const selectProp = (
  definitionId: string,
  value: string
): OptionClause => ({
  propf: clause.eq('properties', {
    propertyId: definitionId,
    type: 'select',
    value,
  }),
});
export const entityProp = (
  definitionId: string,
  value: string
): OptionClause => ({
  propf: clause.eq('properties', {
    propertyId: definitionId,
    type: 'entity',
    value,
  }),
});
