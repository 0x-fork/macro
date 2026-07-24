import type { EntityData } from '@entity';

export type TransformSoupEntitiesOptions = {
  sort?: boolean;
  priorityIds?: readonly string[];
};

export type SoupEntityTransformerOptions<
  TInput extends EntityData,
  TEntity extends EntityData,
> = {
  enrich: (entity: TInput) => TEntity;
  include: (entity: TEntity) => boolean;
  deduplicate: (entities: TEntity[]) => TEntity[];
  compare: (left: TEntity, right: TEntity) => number;
};

/** Creates the canonical enrichment, filtering, deduplication, and sorting pipeline. */
export function createSoupEntityTransformer<
  TInput extends EntityData,
  TEntity extends EntityData,
>(options: SoupEntityTransformerOptions<TInput, TEntity>) {
  return (
    input: readonly TInput[],
    transformOptions: TransformSoupEntitiesOptions = {}
  ): TEntity[] => {
    let entities = options.deduplicate(
      input.map(options.enrich).filter(options.include)
    );

    if (transformOptions.sort) {
      entities = [...entities].sort(options.compare);
    }

    const priorityIds = transformOptions.priorityIds;
    if (!priorityIds?.length) return entities;

    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const priorityIdSet = new Set(priorityIds);
    return [
      ...priorityIds.flatMap((id) => {
        const entity = byId.get(id);
        return entity ? [entity] : [];
      }),
      ...entities.filter((entity) => !priorityIdSet.has(entity.id)),
    ];
  };
}
