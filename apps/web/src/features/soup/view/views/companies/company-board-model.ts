import { NO_STAGE } from '@app/features/soup/filtering/facets/base';

export const NO_STAGE_KEY = '';

export type CompanyBoardStage = { id: string; label: string };
export type CompanyBoardEntity = { id: string };

export function buildCompanyBoardColumns<
  TEntity extends CompanyBoardEntity,
>(input: {
  activeStages: readonly CompanyBoardStage[];
  filterStages: readonly CompanyBoardStage[];
  selectedStageIds: readonly string[];
  entities: readonly TEntity[];
  resolveStage: (entity: TEntity) => string | undefined;
}) {
  const active = new Set(input.activeStages.map((stage) => stage.id));
  const candidates = [
    ...input.filterStages.map((stage) => ({
      key: stage.id,
      label: stage.label,
    })),
    { key: NO_STAGE_KEY, label: 'No stage' },
  ].filter((column) => {
    if (input.selectedStageIds.length > 0) {
      return input.selectedStageIds.includes(column.key || NO_STAGE);
    }
    return column.key === NO_STAGE_KEY || active.has(column.key);
  });

  const buckets = new Map(
    candidates.map((column) => [column.key, [] as TEntity[]])
  );
  for (const entity of input.entities) {
    const resolved = input.resolveStage(entity) ?? NO_STAGE_KEY;
    const key = buckets.has(resolved) ? resolved : NO_STAGE_KEY;
    buckets.get(key)?.push(entity);
  }

  return candidates.map((column) => ({
    ...column,
    entities: buckets.get(column.key) ?? [],
  }));
}

export function canMoveCompanyFromStage(input: {
  stage: string;
  canEditCrm: boolean;
  canMoveClosedDeals: boolean;
  closedStageIds: ReadonlySet<string>;
}) {
  return (
    input.canEditCrm &&
    (input.stage === NO_STAGE_KEY ||
      !input.closedStageIds.has(input.stage) ||
      input.canMoveClosedDeals)
  );
}

export const companyStageMutationValues = (stage: string) =>
  stage === NO_STAGE_KEY ? null : [stage];
