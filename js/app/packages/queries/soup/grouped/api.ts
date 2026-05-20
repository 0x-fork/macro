import { match } from 'ts-pattern';
import type { GroupByField, GroupedSoupPage, GroupMeta } from './types';

/**
 * Serialize GroupByField to the API's expected JSON format.
 */
export function serializeGroupByField(field: GroupByField): unknown {
  return match(field)
    .with({ type: 'date' }, () => 'date')
    .with({ type: 'entity_type' }, () => 'entity_type')
    .with({ type: 'project' }, () => 'project')
    .with({ type: 'property' }, (field) => ({
      property: {
        property_definition_id: field.propertyDefinitionId,
        ...(field.entityType && { entity_type: field.entityType }),
      },
    }))
    .exhaustive();
}

/**
 * Parse raw API group metadata to typed GroupMeta.
 */
export function parseGroupMeta(raw: Record<string, unknown>): GroupMeta {
  return {
    key: raw.key as string,
    label: raw.label as string,
    displayOrder: (raw.display_order as number) ?? null,
    totalCount: raw.total_count as number,
    pageCount: raw.page_count as number,
    startIndex: raw.start_index as number,
    nextCursor: (raw.next_cursor as string) ?? null,
  };
}

/**
 * Parse the API response into our typed GroupedSoupPage.
 * Handles snake_case to camelCase conversion.
 */
export function parseGroupedSoupPage(response: unknown): GroupedSoupPage {
  const data = response as Record<string, unknown>;
  const items = (data.items ?? []) as GroupedSoupPage['items'];
  const nextCursor = (data.next_cursor as string) ?? null;
  const rawGroups = (data.groups ?? []) as Array<Record<string, unknown>>;

  return {
    items,
    nextCursor,
    groups: rawGroups.map(parseGroupMeta),
  };
}
