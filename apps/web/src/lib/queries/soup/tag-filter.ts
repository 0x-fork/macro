import type { TagFilterMode } from '@app/features/next-soup/filters/filter-store/types';
import type { EntityData } from '@entity';
import type {
  SoupApiItem,
  SoupProperty,
} from '@service-storage/generated/schemas';

const propertiesMatchTagFilter = (
  properties: readonly SoupProperty[] | undefined,
  tagOptionIds: readonly string[],
  mode: TagFilterMode
): boolean => {
  if (tagOptionIds.length === 0) return true;
  if (!properties?.length) return false;

  const held = new Set<string>();
  for (const { value } of properties) {
    if (value?.type !== 'SelectOption') continue;
    for (const id of value.value) held.add(id);
  }

  return mode === 'all'
    ? tagOptionIds.every((id) => held.has(id))
    : tagOptionIds.some((id) => held.has(id));
};

export const soupItemMatchesTagFilter = (
  item: SoupApiItem,
  tagOptionIds: readonly string[],
  mode: TagFilterMode = 'any'
): boolean =>
  propertiesMatchTagFilter(
    'properties' in item.data ? item.data.properties : undefined,
    tagOptionIds,
    mode
  );

export const entityMatchesTagFilter = (
  entity: EntityData,
  tagOptionIds: readonly string[],
  mode: TagFilterMode = 'any'
): boolean =>
  propertiesMatchTagFilter(
    'properties' in entity ? entity.properties : undefined,
    tagOptionIds,
    mode
  );
