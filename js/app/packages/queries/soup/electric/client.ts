import { SERVER_HOSTS } from '@core/constant/servers';
import { Shape, ShapeStream } from '@electric-sql/client';
import type { ChatEntity, DocumentEntity, ProjectEntity } from '@entity';

/**
 * ElectricSQL-backed soup sync (framework-agnostic core).
 *
 * Soup is normally an amalgamated HTTP read across ~9 source tables. Electric
 * syncs a single Postgres *table* per shape, so the backend projects the soup
 * feed into one replicable `soup_items` table (see migration
 * 20260625031630_soup_items_electric_sync.sql) and we sync ONE shape here:
 *   table=soup_items WHERE user_id = <me> AND deleted = false
 *
 * v1 covers document/chat/project; the other six soup types are added by
 * extending the backend projection + this row mapper.
 */

export type SoupItemType = 'document' | 'chat' | 'project';

/** A row of the synced `soup_items` table. Mirrors the backend projection. */
export type SoupItemRow = {
  soup_id: string;
  entity_id: string;
  item_type: SoupItemType;
  user_id: string;
  name: string | null;
  project_id: string | null;
  file_type: string | null;
  sort_ts: string;
  created_at: string;
  updated_at: string;
  deleted: boolean;
  data: Record<string, unknown>;
};

export const SOUP_ELECTRIC_TABLE = 'soup_items';

/** Base URL of the Electric HTTP shape API (`GET /v1/shape`). */
export function electricShapeUrl(): string {
  return `${SERVER_HOSTS.electric}/v1/shape`;
}

/**
 * Feature flag: serve the soup feed from Electric instead of the HTTP soup
 * endpoint. Off by default — set `VITE_SOUP_ELECTRIC=true` (with the electric
 * service running and `VITE_LOCAL_SERVERS` including `electric`) to enable.
 */
export function isSoupElectricEnabled(): boolean {
  return import.meta.env.VITE_SOUP_ELECTRIC === 'true';
}

/**
 * Creates a {@link Shape} over `soup_items` scoped to one user. The caller owns
 * the lifecycle: pass an `AbortSignal` and abort it (plus unsubscribe) on
 * teardown.
 *
 * The `where` clause embeds the macro user id. These ids are server-controlled,
 * not free user input; in production Electric is fronted by a gatekeeper/proxy
 * that injects and authorizes this clause rather than trusting the client.
 */
export function createSoupItemsShape(
  userId: string,
  signal?: AbortSignal
): Shape<SoupItemRow> {
  const stream = new ShapeStream<SoupItemRow>({
    url: electricShapeUrl(),
    params: {
      table: SOUP_ELECTRIC_TABLE,
      where: `user_id = '${userId}' AND deleted = false`,
    },
    signal,
  });
  return new Shape<SoupItemRow>(stream);
}

/** Maps a synced `soup_items` row to the app's `EntityData`. */
export function mapSoupItemRowToEntity(
  row: SoupItemRow
): DocumentEntity | ChatEntity | ProjectEntity {
  const base = {
    id: row.entity_id,
    name: row.name ?? '',
    ownerId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sortTs: row.sort_ts,
  };

  switch (row.item_type) {
    case 'document':
      return {
        ...base,
        type: 'document',
        fileType: row.file_type ?? undefined,
        projectId: row.project_id ?? undefined,
        subType: undefined,
      };
    case 'chat':
      return {
        ...base,
        type: 'chat',
        projectId: row.project_id ?? undefined,
      };
    case 'project':
      return {
        ...base,
        type: 'project',
        projectId: row.project_id ?? undefined,
      };
  }
}
