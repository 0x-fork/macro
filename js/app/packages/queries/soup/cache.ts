import { createQueryNormalizer } from '@normy/query-core';
import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from '@tanstack/solid-query';
import type {
  PostSoupRequest,
  SoupApiItem,
} from '@service-storage/generated/schemas';
import type { SoupPage } from '@service-storage/generated/schemas/soupPage';
import type { UnifiedSearchResponseItem } from '@service-search/generated/models';
import { isErr } from '@core/util/maybeResult';
import { queryClient } from '../client';
import { soupKeys } from './keys';

/**
 * Extracts a normalization key from SoupApiItem wrappers.
 * Only objects with `tag + data + frecency_score` are normalized.
 * Everything else (SoupProperty, nested data objects) is left inline.
 */
const getNormalizationObjectKey = (
  obj: Record<string, unknown>
): string | undefined => {
  if ('tag' in obj && 'data' in obj && 'frecency_score' in obj) {
    const data = obj.data as Record<string, unknown>;
    if (obj.tag === 'channel') {
      const channel = data?.channel as Record<string, unknown> | undefined;
      return channel?.id ? `soup:${channel.id}` : undefined;
    }
    return data?.id ? `soup:${data.id}` : undefined;
  }
  return undefined;
};

let _normalizer: ReturnType<typeof createQueryNormalizer> | undefined;
let _queryClient: QueryClient | undefined;

export function getSoupNormalizer() {
  if (!_normalizer) {
    throw new Error(
      'soupNormalizer not initialized — call initSoupNormalizer() first'
    );
  }
  return _normalizer;
}

/**
 * Create and subscribe the normalizer. Call once at app startup.
 * Accepts queryClient as a parameter to avoid circular imports.
 */
export function initSoupNormalizer(qc: QueryClient): () => void {
  _queryClient = qc;
  _normalizer = createQueryNormalizer(qc, {
    getNormalizationObjectKey,
  });
  _normalizer.subscribe();
  return () => _normalizer!.unsubscribe();
}

type NormalizerData = Parameters<
  ReturnType<typeof createQueryNormalizer>['setNormalizedData']
>[0];

/**
 * Push a partial SoupApiItem-shaped update into the normalized store.
 * Normy deep-merges `data` fields, so you only need the fields that changed.
 *
 * For channels pass `data: { channel: { id, ...changed } }`.
 * For everything else pass `data: { id, ...changed }`.
 */
export function optimisticUpdateSoupEntity(
  partial: Record<string, unknown>
): SoupTrasaction {
  const normalizer = getSoupNormalizer();
  const normKey = getNormalizationObjectKey(partial);

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

  normalizer.setNormalizedData(partial as NormalizerData);

  return {
    rollback: () => {
      for (const [key, data] of previous) {
        queryClient.setQueryData(key, data);
      }
    },
  };
}

/**
 * Retrieve a cached soup entity by its ID.
 * Returns the normalized object or undefined if not found.
 */
export function getSoupEntityById(
  entityId: string
): Record<string, unknown> | undefined {
  const obj = getSoupNormalizer().getObjectById(`soup:${entityId}`);
  return (obj as Record<string, unknown> | undefined) ?? undefined;
}

/**
 * Invalidate only the soup queries that reference a specific entity.
 * Uses normy's dependency graph — O(1) lookup instead of scanning all pages.
 */
export function invalidateSoupEntity(entityId: string): void {
  const normalizer = getSoupNormalizer();
  const qc = _queryClient!;
  const keys = normalizer.getDependentQueriesByIds([`soup:${entityId}`]);
  for (const queryKey of keys) {
    qc.invalidateQueries({ queryKey });
  }
}

/** Invalidate every soup list query. Prefer `invalidateSoupEntity` when possible. */
export function invalidateAllSoup(): void {
  _queryClient!.invalidateQueries({
    queryKey: soupKeys.items._def,
  });
}

/** O(1) check whether a soup entity is in the normalized store. */
export function hasSoupEntity(entityId: string): boolean {
  return getSoupNormalizer().getObjectById(`soup:${entityId}`) != null;
}

export interface SoupTrasaction {
  rollback(): ReturnType<typeof restoreSnapshot>;
}

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

export function removeSoupEntities(entityIds: Set<string>): SoupTrasaction {
  queryClient.cancelQueries({ queryKey: soupKeys.items._def });

  const previous = snapshotSoup();

  queryClient.setQueriesData<InfiniteData<SoupPage, unknown>>(
    { queryKey: soupKeys.items._def },
    (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((page) => ({
          ...page,
          items: page.items.filter(
            (item) => !entityIds.has(getSoupItemId(item))
          ),
        })),
      };
    }
  );

  return { rollback: () => restoreSnapshot(previous) };
}

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
      pages: prev.pages.map((page) => ({
        ...page,
        results: page.results.filter(
          (result) => !entityIds.has(getSearchResultId(result))
        ),
      })),
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

export type SoupEntityTag =
  | 'document'
  | 'chat'
  | 'channel'
  | 'project'
  | 'emailThread';

function buildSingleEntityFilter(
  entityType: SoupEntityTag,
  entityId: string
): PostSoupRequest | null {
  const base = { limit: 1 } satisfies Partial<PostSoupRequest>;
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
    optimisticUpdateSoupEntity(item as unknown as Record<string, unknown>);
  } else {
    // Prepend to first page of every active soup list query.
    // Normy auto-normalizes the new entry on insertion.
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
  }
}
