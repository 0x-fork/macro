import type { EntityData } from '@entity';
import {
  getCompanyOwnerId,
  getCompanyStageOptionId,
  isCrmCompanyEntity,
} from '@entity';
import type { FacetCtx } from './base';
import { facet, NO_ASSIGNEE, NO_STAGE } from './base';

// CRM companies come from a capped, dedicated soup request with no property
// support in the AST (`ccf` target), so stage/owner filtering is client-side:
// predicate-only facets (no backend clause) applied by the facet store's
// `test` in `baseEntities`.

// A company's stage within the team's active deal-stage set. `resolveStage`
// (from `ctx.resolveCompanyStage`, backed by `useDealStages`) maps legacy
// system-stage values onto custom stages so the filter buckets companies
// exactly like the kanban; falls back to the raw system value when absent.
const stageOf = (entity: EntityData, ctx: FacetCtx): string | undefined =>
  ctx.resolveCompanyStage
    ? ctx.resolveCompanyStage(entity)
    : getCompanyStageOptionId(
        entity as Parameters<typeof getCompanyStageOptionId>[0]
      );

// Open id space: each picked id is a deal-stage option id (team-customizable,
// so options resolve per-id); NO_STAGE matches companies with no Stage set.
export const COMPANY_STAGE = facet({
  id: 'company-stage',
  mode: 'or',
  multiple: true,
  options: (stageId) =>
    stageId === NO_STAGE
      ? {
          id: stageId,
          predicate: (e, ctx) => isCrmCompanyEntity(e) && !stageOf(e, ctx),
        }
      : {
          id: stageId,
          predicate: (e, ctx) =>
            isCrmCompanyEntity(e) && stageOf(e, ctx) === stageId,
        },
});

// Open id space: each picked id is an owner (person) id; NO_ASSIGNEE matches
// companies with no Owner set.
export const COMPANY_OWNER = facet({
  id: 'company-owner',
  mode: 'or',
  options: (ownerId) =>
    ownerId === NO_ASSIGNEE
      ? {
          id: ownerId,
          predicate: (e) => isCrmCompanyEntity(e) && !getCompanyOwnerId(e),
        }
      : {
          id: ownerId,
          predicate: (e) =>
            isCrmCompanyEntity(e) && getCompanyOwnerId(e) === ownerId,
        },
});
