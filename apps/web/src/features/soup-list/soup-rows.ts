import type { EntityData } from '@entity';
import type { SoupEntityRow, SoupRow } from './types';

export const createSoupEntityRow = <TEntity extends EntityData>(
  entity: TEntity,
  groupId?: string
): SoupEntityRow<TEntity> => {
  if (groupId === undefined) {
    return {
      kind: 'entity',
      id: `entity:${entity.id}`,
      entity,
    };
  }

  return {
    kind: 'entity',
    id: `entity:${groupId}:${entity.id}`,
    entity,
    groupId,
  };
};

export const getSoupRowEntities = (rows: readonly SoupRow[]): EntityData[] =>
  rows
    .filter((row): row is SoupEntityRow => row.kind === 'entity')
    .map((row) => row.entity);

export const isSoupRowVisible = (
  row: SoupRow,
  isGroupExpanded: (groupId: string) => boolean
): boolean => {
  if (row.kind === 'group-header' || row.kind === 'section-header') return true;
  return row.groupId === undefined || isGroupExpanded(row.groupId);
};
