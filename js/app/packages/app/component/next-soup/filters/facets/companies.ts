import { getCompanyOwnerId, isCrmCompanyEntity } from '@entity';
import { PROPERTY_OPTION_IDS } from '@property/constants';
import { hasCompanyStage, hasNoCompanyStage } from '../predicates';
import { facet, NO_ASSIGNEE } from './base';

const STAGE = PROPERTY_OPTION_IDS.STAGE;

// CRM companies come from a capped, dedicated soup request with no property
// support in the AST (`ccf` target), so stage/owner filtering is client-side:
// predicate-only facets (no backend clause) applied by the facet store's
// `test` in `baseEntities`.
export const COMPANY_STAGE = facet({
  id: 'company-stage',
  mode: 'or',
  multiple: true,
  options: [
    {
      id: 'company-stage-lead',
      predicate: (e) => hasCompanyStage(e, STAGE.LEAD),
    },
    {
      id: 'company-stage-qualified',
      predicate: (e) => hasCompanyStage(e, STAGE.QUALIFIED),
    },
    {
      id: 'company-stage-demo',
      predicate: (e) => hasCompanyStage(e, STAGE.DEMO),
    },
    {
      id: 'company-stage-trial',
      predicate: (e) => hasCompanyStage(e, STAGE.TRIAL),
    },
    {
      id: 'company-stage-negotiation',
      predicate: (e) => hasCompanyStage(e, STAGE.NEGOTIATION),
    },
    {
      id: 'company-stage-customer',
      predicate: (e) => hasCompanyStage(e, STAGE.CUSTOMER),
    },
    {
      id: 'company-stage-churned',
      predicate: (e) => hasCompanyStage(e, STAGE.CHURNED),
    },
    { id: 'company-no-stage', predicate: hasNoCompanyStage },
  ],
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
