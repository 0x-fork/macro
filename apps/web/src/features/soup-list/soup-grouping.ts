import { dateBucket } from '@app/features/next-soup/soup-view/group-by-date';
import type { EntityData } from '@entity';
import type { GroupByField } from '@queries/soup/grouped/types';
import type { Accessor } from 'solid-js';
import type { SoupCollectionControls } from './create-soup-collection-state';
import { createSoupEntityRow } from './soup-rows';
import type { SoupRow } from './types';

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
    if (typeof first !== 'string') return '';
    return first;
  }

  if (value.type !== 'EntityReference') return '';
  const first = value.value[0];
  if (!first || typeof first !== 'object' || !('entity_id' in first)) return '';
  return String(first.entity_id);
};

export function buildDateSoupRows<TEntity extends EntityData>(
  entities: readonly TEntity[],
  now = new Date()
): SoupRow[] {
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

  const rows: SoupRow[] = [];
  for (const id of order) {
    const groupEntities = buckets.get(id);
    const label = labels.get(id);
    if (!groupEntities || label === undefined) continue;

    rows.push({
      kind: 'group-header',
      id: `group:${id}`,
      groupId: id,
      label,
    });
    rows.push(
      ...groupEntities.map((entity) => createSoupEntityRow(entity, id))
    );
  }

  return rows;
}

type PropertyGroupRowsOptions<TEntity extends EntityData> = {
  groupIdFor: (entity: TEntity) => string;
  preferredOrder: readonly string[];
  labelFor: (groupId: string) => string;
};

export function buildPropertySoupRows<TEntity extends EntityData>(
  entities: readonly TEntity[],
  options: PropertyGroupRowsOptions<TEntity>
): SoupRow[] {
  const buckets = new Map<string, TEntity[]>();
  for (const entity of entities) {
    const id = options.groupIdFor(entity);
    const bucket = buckets.get(id);
    if (bucket) {
      bucket.push(entity);
      continue;
    }
    buckets.set(id, [entity]);
  }

  const ids = [...buckets.keys()].sort((left, right) => {
    if (left === '') return 1;
    if (right === '') return -1;

    const leftIndex = options.preferredOrder.indexOf(left);
    const rightIndex = options.preferredOrder.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) {
      return options.labelFor(left).localeCompare(options.labelFor(right));
    }

    const fallbackIndex = options.preferredOrder.length;
    let leftOrder = leftIndex;
    if (leftOrder === -1) leftOrder = fallbackIndex;
    let rightOrder = rightIndex;
    if (rightOrder === -1) rightOrder = fallbackIndex;
    return leftOrder - rightOrder;
  });

  const rows: SoupRow[] = [];
  for (const id of ids) {
    const groupEntities = buckets.get(id);
    if (!groupEntities) continue;

    let label = 'Not set';
    if (id !== '') label = options.labelFor(id);

    rows.push({
      kind: 'group-header',
      id: `group:${id}`,
      groupId: id,
      label,
      count: groupEntities.length,
    });
    rows.push(
      ...groupEntities.map((entity) => createSoupEntityRow(entity, id))
    );
  }

  return rows;
}

export type ServerSoupGroup<TEntity extends EntityData = EntityData> = {
  id: string;
  label: string;
  entities: readonly TEntity[];
  count: number;
  loadMore?: () => Promise<unknown>;
  isLoading?: Accessor<boolean>;
};

/** Builds the complete server-grouped row model with per-group pagination. */
export function buildServerSoupRows<TEntity extends EntityData>(
  groups: readonly ServerSoupGroup<TEntity>[]
): SoupRow[] {
  const rows: SoupRow[] = [];

  for (const group of groups) {
    if (group.entities.length === 0) continue;

    rows.push({
      kind: 'group-header',
      id: `group:${group.id}`,
      groupId: group.id,
      label: group.label,
      count: group.count,
    });
    rows.push(
      ...group.entities.map((entity) => createSoupEntityRow(entity, group.id))
    );

    if (group.loadMore) {
      rows.push({
        kind: 'load-more',
        id: `load-more:${group.id}`,
        groupId: group.id,
        isLoading: group.isLoading,
        loadMore: group.loadMore,
      });
    }
  }

  return rows;
}

export function createSoupGrouping(controls: SoupCollectionControls) {
  const active = () => controls.groupByField() !== undefined;

  const isClientDateGroup = () => controls.groupByField()?.type === 'date';

  const isClientPropertyGroup = () => {
    const field = controls.groupByField();
    const scopes = controls.facets.getSelected('scope');

    return (
      field?.type === 'property' &&
      (scopes.includes('crm-company-active') ||
        scopes.includes('crm-company-hidden'))
    );
  };

  const serverGroupByField = (): GroupByField | undefined => {
    if (isClientDateGroup() || isClientPropertyGroup()) return;
    return controls.groupByField();
  };

  return {
    active,
    isClientDateGroup,
    isClientPropertyGroup,
    serverGroupByField,
  };
}
