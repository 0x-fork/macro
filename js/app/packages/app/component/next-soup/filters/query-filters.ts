import type { SoupItemsQueryFilters } from '@queries/soup/items';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const EXCLUDE: string[] = [NIL_UUID];

// Base filter that excludes all entity types by default. Add concrete ids on
// top to opt entity types back in.
//
// Cache matching against these filters (the old `filterSoupItemByRequestBody`)
// is handled by the Rust wasm evaluator now — see
// `@queries/soup/wasm-filter.ts` and `js/app/packages/soup-filter-wasm`.
export const QUERY_FILTERS_BASE: SoupItemsQueryFilters = {
  call_filters: { call_ids: EXCLUDE },
  channel_filters: { channel_ids: EXCLUDE },
  chat_filters: { chat_ids: EXCLUDE },
  crm_company_filters: { company_ids: EXCLUDE },
  document_filters: { document_ids: EXCLUDE },
  email_filters: { email_thread_ids: EXCLUDE },
  foreign_entity_filters: { ids: EXCLUDE },
  project_filters: { project_ids: EXCLUDE },
};
