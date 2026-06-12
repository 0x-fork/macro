import type { Entity, EntityType } from '@core/types';
import type { ApiUserNotification } from '@service-notification/generated/schemas';

export type UnifiedNotification = Omit<ApiUserNotification, 'owner_id'>;

type NotificationZodModule =
  typeof import('@service-notification/generated/zod');

function buildUnifiedNotificationSchema(m: NotificationZodModule) {
  const baseSchema = m.listTypedNotificationsResponse.shape.items.element;
  const entitySchema = baseSchema._def.left;
  const allOfSchema = baseSchema._def.right;
  return entitySchema.and(allOfSchema.omit({ owner_id: true }));
}

export type UnifiedNotificationSchema = ReturnType<
  typeof buildUnifiedNotificationSchema
>;

// The generated zod module is large and zod schema construction isn't
// tree-shakeable, so it loads lazily instead of with the initial bundle.
// Callers parse with the schema once loaded and fall back to the unvalidated
// value until then — the same fallback the parse-failure path already takes.
let loadedSchema: UnifiedNotificationSchema | null = null;
let schemaPromise: Promise<UnifiedNotificationSchema> | null = null;

export function loadUnifiedNotificationSchema(): Promise<UnifiedNotificationSchema> {
  schemaPromise ??= import('@service-notification/generated/zod').then((m) => {
    loadedSchema = buildUnifiedNotificationSchema(m);
    return loadedSchema;
  });
  return schemaPromise;
}

/** Sync access; null until loadUnifiedNotificationSchema() resolves. */
export function getUnifiedNotificationSchema(): UnifiedNotificationSchema | null {
  return loadedSchema;
}

export type CompositeEntity = `${EntityType}@${string}`;

export function compositeEntity(entity: Entity): CompositeEntity {
  return `${entity.type}@${entity.id}`;
}

export function notificationEntity(notification: UnifiedNotification): Entity {
  return {
    id: notification.entity_id,
    type: notification.entity_type as EntityType,
  };
}
