import { useSoupAstItemsQuery } from '@queries/soup/items';
import type { Accessor } from 'solid-js';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Email threads the team has exchanged with a company, fetched via the
 * `/soup/ast` endpoint. The company's domains are passed as the CRM domain
 * filter (`ecd`); every non-email entity type is excluded with the nil-uuid
 * sentinel so only email threads come back.
 */
export function useCompanyEmailsQuery(domains: Accessor<string[]>) {
  return useSoupAstItemsQuery(
    () => ({
      params: { limit: 100, sort_method: 'updated_at' },
      body: {
        df: { l: { id: NIL_UUID } },
        chanf: { l: { ChannelId: NIL_UUID } },
        cf: { l: { cid: NIL_UUID } },
        pf: { l: { pid: NIL_UUID } },
        callf: { l: { CallId: NIL_UUID } },
        ccf: { l: { id: NIL_UUID } },
        ecd: domains(),
        emailView: 'all',
      },
    }),
    () => ({ enabled: domains().length > 0 })
  );
}
