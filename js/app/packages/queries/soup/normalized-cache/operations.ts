import type { InfiniteData, QueryKey } from '@tanstack/solid-query';
import type {
  PostSoupRequest,
  SoupApiItem,
} from '@service-storage/generated/schemas';
import type { SoupPage } from '@service-storage/generated/schemas/soupPage';
import type { UnifiedSearchResponseItem } from '@service-search/generated/models';
import { isErr } from '@core/util/maybeResult';
import { queryClient } from '../../client';
import { soupKeys } from '../keys';
import {
  getSoupNormalizer,
  getNormalizationObjectKey,
  type NormalizerData,
} from './normalizer';
import type { SoupTrasaction, SoupEntityTag, SoupEntityPartial } from './types';

/**
 * Optimistically update a single soup entity across all queries that reference it.
 * Normy deep-merges into its normalized store, so only changed fields are needed.
 * Returns a transaction whose `rollback()` restores only the affected queries
 * (scoped via normy's dependency graph — not a full soup snapshot).
 *
 * Channels: `{ tag: 'channel', data: { channel: { id, ...fields } }, frecency_score }`
 * Everything else: `{ tag, data: { id, ...fields }, frecency_score }`
 */
export function optimisticUpdateSoupEntity<T extends SoupEntityTag>(
  partial: SoupEntityPartial<T>
): SoupTrasaction {
  const record = partial as unknown as Record<string, unknown>;
  const normalizer = getSoupNormalizer();
  const normKey = getNormalizationObjectKey(record);

  const dependentKeys = normKey
    ? normalizer.getDependentQueriesByIds([normKey])
    : [];

  const previous = dependentKeys.map(
    (key) =>
      [
        key,
        queryClient.getQueryData<InfiniteData<SoupPage, unknown>>(key),
      ] as const
  );

  normalizer.setNormalizedData(record as NormalizerData);

  return {
    rollback: () => {
      for (const [key, data] of previous) {
        queryClient.setQueryData(key, data);
      }
    },
  };
}

/** Read an entity from normy's normalized store by ID. Returns `undefined` if not cached. */
export function getSoupEntityById(entityId: string): SoupApiItem | undefined {
  const obj = getSoupNormalizer().getObjectById(`soup:${entityId}`);
  return (obj as SoupApiItem | undefined) ?? undefined;
}

/**
 * Mark stale only the soup queries containing a specific entity.
 * Uses normy's dependency graph for O(1) lookup — does not scan pages.
 * Prefer this over `invalidateAllSoup` when you know the affected entity ID.
 */
export function invalidateSoupEntity(entityId: string): void {
  const normalizer = getSoupNormalizer();
  const keys = normalizer.getDependentQueriesByIds([`soup:${entityId}`]);
  for (const queryKey of keys) {
    queryClient.invalidateQueries({ queryKey });
  }
}

/** Mark every soup list query stale. Use `invalidateSoupEntity` when the entity ID is known. */
export function invalidateAllSoup(): void {
  queryClient.invalidateQueries({
    queryKey: soupKeys.items._def,
  });
}

/** O(1) check whether an entity exists in normy's normalized store. */
export function hasSoupEntity(entityId: string): boolean {
  return getSoupNormalizer().getObjectById(`soup:${entityId}`) != null;
}

/** Extract the canonical entity ID from a SoupApiItem (handles channel's nested `data.channel.id`). */
export function getSoupItemId(item: SoupApiItem): string {
  switch (item.tag) {
    case 'channel':
      return item.data.channel.id;
    default:
      return item.data.id;
  }
}

function getSearchResultId(result: UnifiedSearchResponseItem): string {
  switch (result.type) {
    case 'document':
      return result.document_id;
    case 'chat':
      return result.chat_id;
    case 'channel':
      return result.channel_id;
    case 'email':
      return result.thread_id;
    case 'project':
      return result.id;
  }
}

function snapshotSoup(): [
  QueryKey,
  InfiniteData<SoupPage, unknown> | undefined,
][] {
  return queryClient.getQueriesData<InfiniteData<SoupPage, unknown>>({
    queryKey: soupKeys.items._def,
  });
}

function restoreSnapshot(
  snapshot: [QueryKey, InfiniteData<SoupPage, unknown> | undefined][]
): void {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
}

/**
 * Insert a new entity into the first page of every active soup list query.
 * Normy auto-normalizes the entry on insertion, making it available via `getSoupEntityById`.
 * Use for entities that don't yet exist in the cache. For existing entities use
 * `optimisticUpdateSoupEntity` (deep-merge) instead.
 */
export function insertSoupEntity(item: SoupApiItem): SoupTrasaction {
  const previous = snapshotSoup();

  queryClient.setQueriesData<InfiniteData<SoupPage, unknown>>(
    { queryKey: soupKeys.items._def },
    (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((p, i) => {
          if (i !== 0) return p;
          return { ...p, items: [item, ...p.items] };
        }),
      };
    }
  );

  return { rollback: () => restoreSnapshot(previous) };
}

/**
 * Optimistically remove entities from all soup list queries.
 * Cancels in-flight fetches first to prevent them from re-adding removed items.
 * Snapshots the full soup cache before mutating — rollback restores everything.
 */
export function removeSoupEntities(entityIds: Set<string>): SoupTrasaction {
  queryClient.cancelQueries({ queryKey: soupKeys.items._def });

  const previous = snapshotSoup();

  queryClient.setQueriesData<InfiniteData<SoupPage, unknown>>(
    { queryKey: soupKeys.items._def },
    (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((page) => {
          const items = page.items.filter(
            (item) => !entityIds.has(getSoupItemId(item))
          );
          return items.length === page.items.length ? page : { ...page, items };
        }),
      };
    }
  );

  return { rollback: () => restoreSnapshot(previous) };
}

/**
 * Optimistically remove entities from all search result queries.
 * Same cancel-snapshot-mutate pattern as `removeSoupEntities` but targets search queries.
 */
export function removeSearchEntities(entityIds: Set<string>): SoupTrasaction {
  queryClient.cancelQueries({ queryKey: soupKeys.search._def });

  const previous = queryClient.getQueriesData<
    InfiniteData<{ results: UnifiedSearchResponseItem[] }, unknown>
  >({
    queryKey: soupKeys.search._def,
  });

  queryClient.setQueriesData<
    InfiniteData<{ results: UnifiedSearchResponseItem[] }, unknown>
  >({ queryKey: soupKeys.search._def }, (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      pages: prev.pages.map((page) => {
        const results = page.results.filter(
          (result) => !entityIds.has(getSearchResultId(result))
        );
        return results.length === page.results.length
          ? page
          : { ...page, results };
      }),
    };
  });

  return {
    rollback: () => {
      for (const [key, data] of previous) {
        queryClient.setQueryData(key, data);
      }
    },
  };
}

// UUID that matches no real entity — used to zero out soup filters
// so omitted entity types return nothing instead of everything.
const NIL_ID = '00000000-0000-0000-0000-000000000000';

function buildSingleEntityFilter(
  entityType: SoupEntityTag,
  entityId: string
): PostSoupRequest | null {
  const base: PostSoupRequest = {
    limit: 1,
    document_filters: { document_ids: [NIL_ID] },
    chat_filters: { chat_ids: [NIL_ID] },
    channel_filters: { channel_ids: [NIL_ID] },
    project_filters: { project_ids: [NIL_ID] },
    email_filters: { importance: false },
  };
  switch (entityType) {
    case 'document':
      return { ...base, document_filters: { document_ids: [entityId] } };
    case 'chat':
      return { ...base, chat_filters: { chat_ids: [entityId] } };
    case 'channel':
      return { ...base, channel_filters: { channel_ids: [entityId] } };
    case 'project':
      return { ...base, project_filters: { project_ids: [entityId] } };
    case 'emailThread':
      return null;
  }
}

/**
 * Fetch a single entity from the server and merge it into the cache.
 * If the entity is already cached, updates it via normy (deep-merge).
 * If it's new, prepends it to the first page of every active soup list query.
 * Falls back to `invalidateSoupEntity` for unsupported entity types (e.g. emailThread).
 */
export async function refetchSoupEntity(
  entityId: string,
  entityType: SoupEntityTag
): Promise<void> {
  const { storageServiceClient } = await import('@service-storage/client');

  const filter = buildSingleEntityFilter(entityType, entityId);

  if (!filter) {
    invalidateSoupEntity(entityId);
    return;
  }

  const result = await storageServiceClient.getSoupItems({
    params: {},
    body: filter,
  });

  if (isErr(result)) return;

  const [, page] = result;
  if (!page.items.length) return;

  const item = page.items[0];

  if (hasSoupEntity(entityId)) {
    optimisticUpdateSoupEntity(item);
  } else {
    insertSoupEntity(item);
  }
}
