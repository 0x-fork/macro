import { EntityType as BaseEntityType } from '@service-connection/generated/schemas';

// NOTE: TEMP
export const EntityType = {
  ...BaseEntityType,
  email: 'email',
} as const;

export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export type EntityId = string;
export type Entity = {
  id: EntityId;
  type: EntityType;
};

import type { NotifEvent } from '@service-notification/generated/schemas';
export type NotificationType = NotifEvent['tag'];

type Nullable<T> = T | null;
export type Maybe<T> = T | undefined;

type MaybePromise<T> = T | Promise<T>;
