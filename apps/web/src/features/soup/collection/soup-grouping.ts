import { dateBucket } from '@app/features/next-soup/soup-view/group-by-date';
import type { EntityData } from '@entity';
import { COMPANY_STAGE_OPTIONS } from '@entity/utils/task-properties';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import type { Accessor } from 'solid-js';
import { createSoupEntityRow } from './soup-rows';
import type { SoupRow } from './types';

const soupPropertyGroupKey = (
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

function buildPropertySoupRows<TEntity extends EntityData>(
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

export type BuildClientPropertySoupRowsOptions<TEntity extends EntityData> = {
  propertyDefinitionId: string;
  stageIds: readonly string[];
  resolveStage: (entity: TEntity) => string | undefined;
  labelFor: (groupId: string) => string;
};

export function buildClientPropertySoupRows<TEntity extends EntityData>(
  entities: readonly TEntity[],
  options: BuildClientPropertySoupRowsOptions<TEntity>
): SoupRow[] {
  const stage = options.propertyDefinitionId === SYSTEM_PROPERTY_IDS.STAGE;
  let preferredOrder = COMPANY_STAGE_OPTIONS.map(
    (item) => item.value as string
  );
  if (stage) preferredOrder = [...options.stageIds];

  return buildPropertySoupRows(entities, {
    groupIdFor: (entity) => {
      if (!stage) {
        return soupPropertyGroupKey(entity, options.propertyDefinitionId);
      }
      const stageId = options.resolveStage(entity);
      if (stageId === undefined) return '';
      return stageId;
    },
    preferredOrder,
    labelFor: options.labelFor,
  });
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
