import { type CrmCompanyEntity, isCrmCompanyEntity } from '@entity';
import { useSoupItemsQuery } from '@queries/soup/items';
import { type Accessor, createMemo } from 'solid-js';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Fetches a single CRM company by id through the soup endpoint. Every other
 * entity type is excluded via the nil-uuid sentinel so only the requested
 * company comes back.
 */
export function useCompanyQuery(companyId: Accessor<string>) {
  const query = useSoupItemsQuery(() => ({
    params: { limit: 1 },
    body: {
      call_filters: { call_ids: [NIL_UUID] },
      channel_filters: { channel_ids: [NIL_UUID] },
      chat_filters: { chat_ids: [NIL_UUID] },
      document_filters: { document_ids: [NIL_UUID] },
      email_filters: { email_thread_ids: [NIL_UUID] },
      project_filters: { project_ids: [NIL_UUID] },
      crm_company_filters: { company_ids: [companyId()] },
    },
  }));

  const company = createMemo<CrmCompanyEntity | undefined>(() =>
    query.data?.find(isCrmCompanyEntity)
  );

  return { query, company };
}
