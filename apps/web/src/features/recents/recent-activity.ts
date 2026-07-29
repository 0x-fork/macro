import { QUERY_FILTERS_BASE } from '@app/features/next-soup/filters/query-filters';
import type { EntityData } from '@entity';
import type { SoupItemsQueryArgs } from '@queries/soup/items';
import { differenceInCalendarDays, toDate } from 'date-fns';

/** How many items the sidebar recents query pulls (single page, no load-more). */
export const RECENT_ACTIVITY_LIMIT = 50;

/**
 * Soup query for the sidebar's time-bucketed recents: documents (files +
 * tasks) and chats (agents), ordered by `viewed_updated` — the later of when
 * the viewer opened the item and when it was last edited/received. Emails and
 * channels are deliberately excluded until their activity feeds are ready.
 */
export function buildRecentActivityArgs(): SoupItemsQueryArgs {
  return {
    params: { sort_method: 'viewed_updated', limit: RECENT_ACTIVITY_LIMIT },
    body: {
      ...QUERY_FILTERS_BASE,
      document_filters: undefined,
      chat_filters: undefined,
    },
  };
}

export type RecentActivityBucketKey =
  | 'today'
  | 'yesterday'
  | 'previous-7-days'
  | 'previous-30-days';

export type RecentActivityBucket = {
  key: RecentActivityBucketKey;
  label: string;
  entities: EntityData[];
};

/** Ordered newest-first; an item lands in the first bucket wide enough. */
const BUCKET_DEFS: readonly {
  key: RecentActivityBucketKey;
  label: string;
  maxCalendarDaysAgo: number;
}[] = [
  { key: 'today', label: 'Today', maxCalendarDaysAgo: 0 },
  { key: 'yesterday', label: 'Yesterday', maxCalendarDaysAgo: 1 },
  { key: 'previous-7-days', label: 'Previous 7 Days', maxCalendarDaysAgo: 7 },
  {
    key: 'previous-30-days',
    label: 'Previous 30 Days',
    maxCalendarDaysAgo: 30,
  },
];

/**
 * When an entity last "happened" for the viewer: opened (`viewedAt`) or
 * edited/received (`updatedAt`), whichever is later — mirroring the soup's
 * `viewed_updated` sort. Falls back to `createdAt` (e.g. an agent kicked off
 * but never revisited) and undefined when the row carries no timestamps.
 */
export function entityActivityAt(entity: EntityData): Date | undefined {
  let latest: Date | undefined;
  for (const value of [entity.viewedAt, entity.updatedAt, entity.createdAt]) {
    if (!value) continue;
    const date = toDate(value);
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date > latest) latest = date;
  }
  return latest;
}

/**
 * Group entities into Today / Yesterday / Previous 7 Days / Previous 30 Days
 * by their activity time, newest first within each bucket. Entities older
 * than 30 calendar days (or without any timestamp) are dropped; empty buckets
 * are omitted.
 */
export function bucketRecentActivity(
  entities: readonly EntityData[],
  now: Date
): RecentActivityBucket[] {
  const buckets = BUCKET_DEFS.map(
    (def): RecentActivityBucket => ({
      key: def.key,
      label: def.label,
      entities: [],
    })
  );

  const dated = entities
    .map((entity) => ({ entity, at: entityActivityAt(entity) }))
    .filter(
      (item): item is { entity: EntityData; at: Date } => item.at !== undefined
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  for (const { entity, at } of dated) {
    // Clock skew can stamp an item slightly in the future; count it as today.
    const daysAgo = Math.max(0, differenceInCalendarDays(now, at));
    const index = BUCKET_DEFS.findIndex(
      (def) => daysAgo <= def.maxCalendarDaysAgo
    );
    if (index === -1) continue;
    buckets[index].entities.push(entity);
  }

  return buckets.filter((bucket) => bucket.entities.length > 0);
}
