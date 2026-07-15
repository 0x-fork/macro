import type { EntityData } from '@entity';
import type { Accessor } from 'solid-js';

export type SoupEntityItem<TEntity extends EntityData = EntityData> = {
  kind: 'entity';
  /** Stable identifier for this rendered occurrence, not the entity id. */
  id: string;
  entity: TEntity;
  groupId?: string;
};

export type SoupGroupHeaderItem = {
  kind: 'group-header';
  id: string;
  groupId: string;
  label: string;
  count?: number;
};

export type SoupLoadMoreItem = {
  kind: 'load-more';
  id: string;
  /** Present when this loads another page for one group rather than the list. */
  groupId?: string;
  label?: string;
  isLoading?: Accessor<boolean>;
  loadMore: () => Promise<unknown>;
};

/** Rows emitted by a Soup collection for the concrete Soup view. */
export type SoupItem = SoupEntityItem | SoupGroupHeaderItem | SoupLoadMoreItem;
