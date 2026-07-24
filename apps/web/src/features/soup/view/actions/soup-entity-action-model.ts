import type { EntityData } from '@entity';

export function canDeleteSoupEntity(
  entity: EntityData,
  userId: string | undefined
) {
  if (entity.type === 'email') return true;
  if (
    entity.type === 'channel' ||
    entity.type === 'channel_message' ||
    entity.type === 'channel_thread'
  ) {
    return false;
  }
  return userId !== undefined && entity.ownerId === userId;
}

export function canRenameSoupEntity(
  entity: EntityData,
  userId: string | undefined
) {
  if (!userId || entity.ownerId !== userId) return false;
  if (
    entity.type === 'email' ||
    entity.type === 'channel_message' ||
    entity.type === 'channel_thread' ||
    entity.type === 'foreign'
  ) {
    return false;
  }
  return entity.type !== 'channel' || entity.channelType !== 'direct_message';
}

export function actionTargets<TEntity extends { id: string }>(input: {
  entity: TEntity;
  selected: readonly TEntity[];
  entityIsSelected: boolean;
}) {
  return input.entityIsSelected && input.selected.length > 1
    ? input.selected
    : [input.entity];
}
