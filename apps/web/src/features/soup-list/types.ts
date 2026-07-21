import type { EntityData } from '@entity';
import type { Accessor } from 'solid-js';

export type SoupEntityRow<TEntity extends EntityData = EntityData> = {
  kind: 'entity';
  /** Stable identifier for this rendered occurrence, not the entity id. */
  id: string;
  entity: TEntity;
  groupId?: string;
};

export type SoupGroupHeaderRow = {
  kind: 'group-header';
  id: string;
  groupId: string;
  label: string;
  count?: number;
};

export type SoupSectionHeaderRow = {
  kind: 'section-header';
  id: string;
  label: string;
};

export type SoupLoadMoreRow = {
  kind: 'load-more';
  id: string;
  /** Present when this loads another page for one group rather than the list. */
  groupId?: string;
  label?: string;
  isLoading?: Accessor<boolean>;
  loadMore: () => Promise<unknown>;
};

/** Rows emitted by a Soup collection for the concrete Soup view. */
export type SoupRow =
  | SoupEntityRow
  | SoupGroupHeaderRow
  | SoupSectionHeaderRow
  | SoupLoadMoreRow;
