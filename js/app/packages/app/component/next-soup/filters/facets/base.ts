// Config helpers. Facets are defined with the core `Facet` type directly — no
// separate config type, no adapter. Clauses use the injected builder `b` (no
// imports); `eq` here only backs the property shortcuts.
import type { NotificationSource } from '@notifications';
import { eq, type Facet, type OptionClause } from '../facet-store';

export type { Facet, FacetOption } from '../facet-store';

export type FacetCtx = {
  userId: string;
  assignees?: string[];
  // some preset predicates (focus/unread) test notification state
  notificationSource?: NotificationSource;
};

// Define a facet with the soup context fixed — like the original `config()`
// helper. Pins `Ctx = FacetCtx` so clause builders (`b`) and resolvers are typed
// without per-facet annotations. The `const` type param preserves literal facet
// & option ids, so a store built over these configs gets full key/option safety.
export const facet = <const F extends Facet<FacetCtx>>(def: F): F => def;

// must match the id the dropdown/drawer send (configs/base NO_ASSIGNEE)
export const NO_ASSIGNEE = 'NO_ASSIGNEE';

// sentinel for the exclude "is this type" pattern (e.g. threadId ≠ NIL = is email)
export const NIL = '00000000-0000-0000-0000-000000000000';

// property-clause shortcuts (target propf)
export const selectProp = (
  definitionId: string,
  value: string
): OptionClause => ({
  propf: eq('properties', { propertyId: definitionId, type: 'select', value }),
});
export const entityProp = (
  definitionId: string,
  value: string
): OptionClause => ({
  propf: eq('properties', { propertyId: definitionId, type: 'entity', value }),
});
