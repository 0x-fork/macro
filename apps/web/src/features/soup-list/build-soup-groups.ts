import { dateBucket } from '@app/features/next-soup/soup-view/group-by-date';
import type { EntityData } from '@entity';
import type { SoupItemGroup } from './build-soup-items';

export const soupPropertyGroupKey = (
  entity: EntityData,
  propertyDefinitionId: string
): string => {
  const properties = 'properties' in entity ? (entity.properties ?? []) : [];
  const property = properties.find(
    (candidate) => candidate.definition.id === propertyDefinitionId
  );
  const value = property?.value;
  if (!value) return '';
  if (value.type === 'SelectOption' || value.type === 'Link') {
    const first = value.value[0];
    return typeof first === 'string' ? first : '';
  }
  if (value.type === 'EntityReference') {
    const first = value.value[0];
    return first && typeof first === 'object' && 'entity_id' in first
      ? String(first.entity_id)
      : '';
  }
  return '';
};

export const buildDateSoupGroups = <TEntity extends EntityData>(
  entities: readonly TEntity[],
  now = new Date()
): SoupItemGroup<TEntity>[] => {
  const buckets = new Map<string, TEntity[]>();
  const labels = new Map<string, string>();
  const order: string[] = [];

  for (const entity of entities) {
    const bucket = dateBucket(
      entity.sortTs ?? entity.updatedAt ?? entity.createdAt,
      now
    );
    const existing = buckets.get(bucket.key);
    if (existing) {
      existing.push(entity);
      continue;
    }
    order.push(bucket.key);
    labels.set(bucket.key, bucket.label);
    buckets.set(bucket.key, [entity]);
  }

  return order.map((id) => ({
    id,
    label: labels.get(id)!,
    entities: buckets.get(id)!,
    count: buckets.get(id)!.length,
  }));
};

export const buildPropertySoupGroups = <TEntity extends EntityData>(
  entities: readonly TEntity[],
  options: {
    groupIdFor: (entity: TEntity) => string;
    preferredOrder: readonly string[];
    labelFor: (groupId: string) => string;
  }
): SoupItemGroup<TEntity>[] => {
  const buckets = new Map<string, TEntity[]>();
  for (const entity of entities) {
    const id = options.groupIdFor(entity);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(entity);
    else buckets.set(id, [entity]);
  }

  const ids = [...buckets.keys()].sort((left, right) => {
    if (left === '') return 1;
    if (right === '') return -1;
    const leftIndex = options.preferredOrder.indexOf(left);
    const rightIndex = options.preferredOrder.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (
        (leftIndex === -1 ? options.preferredOrder.length : leftIndex) -
        (rightIndex === -1 ? options.preferredOrder.length : rightIndex)
      );
    }
    return options.labelFor(left).localeCompare(options.labelFor(right));
  });

  return ids.map((id) => ({
    id,
    label: id === '' ? 'Not set' : options.labelFor(id),
    entities: buckets.get(id)!,
    count: buckets.get(id)!.length,
  }));
};
