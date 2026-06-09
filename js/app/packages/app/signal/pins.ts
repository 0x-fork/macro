import type { EntityData } from '@entity';
import { storageServiceClient } from '@service-storage/client';
import { createSignal } from 'solid-js';

/**
 * Client-side store for pinned entities.
 *
 * The macro backend already persists pins (see the `Pin` table and the
 * `/pins` endpoints), but its hydrating `GET /pins` query only returns
 * documents, chats and projects. To support pinning *any* entity type
 * (emails, channels, calls, ...) we keep a local, persisted snapshot of the
 * pinned entities for display and write the pin set through to the backend so
 * it stays the source of truth.
 */

const STORAGE_KEY = 'macro:pinned-entities:v1';

type PinnedEntry = {
  /** The entity id. */
  id: string;
  /** Backend pin type (matches `EntityType`, snake_case). */
  pinType: string;
  /** Snapshot of the entity used to render the pinned row. */
  entity: EntityData;
};

/**
 * Maps a frontend entity to the backend pin type (`EntityType`, snake_case).
 * Returns `null` for entities that cannot be pinned (no entity_access backing).
 */
function toPinType(entity: EntityData): string | null {
  switch (entity.type) {
    case 'document':
      return 'document';
    case 'chat':
      return 'chat';
    case 'project':
      return 'project';
    case 'email':
      return 'email_thread';
    case 'call':
      return 'call';
    case 'channel':
      return 'channel';
    // channel_message, automation and foreign entities are not pinnable.
    default:
      return null;
  }
}

/** Whether the given entity can be pinned. */
export function canPinEntity(entity: EntityData): boolean {
  return toPinType(entity) !== null;
}

function load(): PinnedEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is PinnedEntry =>
        entry != null &&
        typeof entry.id === 'string' &&
        typeof entry.pinType === 'string' &&
        entry.entity != null
    );
  } catch {
    return [];
  }
}

const [entries, setEntries] = createSignal<PinnedEntry[]>(load());

function persist(next: PinnedEntry[]): void {
  setEntries(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable or full; the in-memory signal still works.
  }
}

/** Reactive, ordered list of pinned entities. */
export function pinnedEntities(): EntityData[] {
  return entries().map((entry) => entry.entity);
}

/** Whether an entity (by id) is currently pinned. */
export function isPinned(id: string): boolean {
  return entries().some((entry) => entry.id === id);
}

/** Pins an entity. No-op if it is not pinnable or already pinned. */
export function pinEntity(entity: EntityData): void {
  const pinType = toPinType(entity);
  if (!pinType) return;
  if (isPinned(entity.id)) return;

  const next = [...entries(), { id: entity.id, pinType, entity }];
  persist(next);

  // Write through to the backend (best effort — display is driven locally).
  void storageServiceClient
    .pinItem({ id: entity.id, pinType, pinIndex: next.length - 1 })
    .catch(() => {});
}

/** Removes a pin. No-op if the entity is not pinned. */
export function unpinEntity(id: string): void {
  const existing = entries().find((entry) => entry.id === id);
  if (!existing) return;

  persist(entries().filter((entry) => entry.id !== id));

  void storageServiceClient
    .removePin({ id, pinType: existing.pinType })
    .catch(() => {});
}

/**
 * Toggles the pinned state of an entity.
 * Returns the new pinned state (`true` if now pinned).
 */
export function togglePin(entity: EntityData): boolean {
  if (isPinned(entity.id)) {
    unpinEntity(entity.id);
    return false;
  }
  pinEntity(entity);
  return true;
}
