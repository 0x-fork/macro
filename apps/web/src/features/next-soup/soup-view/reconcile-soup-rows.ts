import type {
  GroupMeta,
  SoupEntity,
  SoupRow,
} from '@app/features/next-soup/create-soup-state';
import { untrack } from 'solid-js';

type SoupRowKind = 'entity' | 'group-header' | 'load-more';

function rowKind(row: SoupRow): SoupRowKind {
  if (row.getIsGrouped()) return 'group-header';
  if (row.getIsLoadMore()) return 'load-more';
  return 'entity';
}

/**
 * Virtua's Solid adapter keys rows by object identity. Include the row variant
 * and group in the logical identity so headers/load-more rows cannot collide
 * with entities, and moving an entity between groups creates a new row.
 */
function rowIdentity(row: SoupRow): string {
  const kind = rowKind(row);
  const groupKey = row.group?.key ?? null;

  if (kind === 'entity') {
    return JSON.stringify([kind, groupKey, row.original.type, row.id]);
  }

  return JSON.stringify([kind, groupKey, row.id]);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  if (typeof left !== typeof right) return false;

  if (left instanceof Date || right instanceof Date) {
    return (
      left instanceof Date &&
      right instanceof Date &&
      left.getTime() === right.getTime()
    );
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((value, index) => valuesEqual(value, right[index]));
  }

  if (typeof left !== 'object') return false;

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([
    ...Object.keys(leftRecord),
    ...Object.keys(rightRecord),
  ]);

  for (const key of keys) {
    if (!valuesEqual(leftRecord[key], rightRecord[key])) return false;
  }

  return true;
}

function notificationValues(entity: SoupEntity): unknown {
  return untrack(() => entity.notifications?.());
}

function entitiesEqual(left: SoupEntity, right: SoupEntity): boolean {
  if (left === right) return true;

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([
    ...Object.keys(leftRecord),
    ...Object.keys(rightRecord),
  ]);
  keys.delete('notifications');

  for (const key of keys) {
    if (!valuesEqual(leftRecord[key], rightRecord[key])) return false;
  }

  return valuesEqual(notificationValues(left), notificationValues(right));
}

function groupsEqual(
  left: GroupMeta | undefined,
  right: GroupMeta | undefined
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;

  return (
    left.key === right.key &&
    left.label === right.label &&
    left.count === right.count &&
    left.renderHeader === right.renderHeader &&
    valuesEqual(left.value, right.value)
  );
}

function rowsEqual(left: SoupRow, right: SoupRow): boolean {
  if (left.id !== right.id || rowKind(left) !== rowKind(right)) return false;
  if (!entitiesEqual(left.original, right.original)) return false;

  // Entity rows only consume the group's stable key and expansion callbacks.
  // Display metadata belongs to structural rows; changing a group count should
  // replace its header/load-more row without remounting every entity in it.
  if (rowKind(left) === 'entity') {
    return left.group?.key === right.group?.key;
  }

  return groupsEqual(left.group, right.group);
}

/**
 * Reuses semantically unchanged SoupRow objects across rebuilt row arrays.
 * Rows may shift when a task moves, so refresh their mutable index while
 * retaining the object Virtua uses as its identity key.
 */
export function reconcileSoupRows(
  previousRows: SoupRow[],
  nextRows: SoupRow[]
): SoupRow[] {
  const previousByIdentity = new Map<string, SoupRow[]>();

  for (const row of previousRows) {
    const identity = rowIdentity(row);
    const matches = previousByIdentity.get(identity);
    if (matches) matches.push(row);
    else previousByIdentity.set(identity, [row]);
  }

  return nextRows.map((nextRow) => {
    const matches = previousByIdentity.get(rowIdentity(nextRow));
    const previousRow = matches?.shift();

    if (!previousRow || !rowsEqual(previousRow, nextRow)) return nextRow;

    previousRow.index = nextRow.index;
    return previousRow;
  });
}
