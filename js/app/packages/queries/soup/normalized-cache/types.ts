import type { SoupApiItem } from '@service-storage/generated/schemas';

export interface SoupTransaction {
  rollback(): void;
}

// Derive tag union from the source of truth instead of manually maintaining it
export type SoupEntityTag = SoupApiItem['tag'];

// Extract data type for a given tag
type SoupItemData<T extends SoupEntityTag> = Extract<
  SoupApiItem,
  { tag: T }
>['data'];

// Channel's inner Channel object (for partial nested updates like { channel: { id, name } })
type ChannelInner = SoupItemData<'channel'>['channel'];

// Partial data: require the entity ID, all else optional.
// Channel is special — ID lives at data.channel.id.
type SoupPartialData<T extends SoupEntityTag> = T extends 'channel'
  ? { channel: Partial<ChannelInner> & Pick<ChannelInner, 'id'> } & Partial<
      Omit<SoupItemData<'channel'>, 'channel'>
    >
  : Partial<SoupItemData<T>> & { id: string };

// A partial soup entity for optimistic updates.
// Generic so callers with literal tags get narrowed checking,
// and callers with union tags still compile (conditional distributes).
export type SoupEntityPartial<T extends SoupEntityTag = SoupEntityTag> = {
  tag: T;
  data: SoupPartialData<T>;
  frecency_score: number;
};
