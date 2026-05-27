import { throwOnErr } from '@core/util/result';
import { storageServiceClient } from '@service-storage/client';
import type { CrmContactResponse } from '@service-storage/generated/schemas';
import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';

const COMPANY_CONTACTS_STALE_TIME = 60 * 1000;

export type CompanyContact = CrmContactResponse;

/**
 * Contacts the team has interacted with at a given CRM company, fetched
 * from `GET /crm/companies/{companyId}/contacts`. Disabled until a
 * company id is available.
 */
export function useCompanyContactsQuery(
  companyId: Accessor<string | undefined>
) {
  return useQuery(() => {
    const id = companyId();
    return {
      queryKey: ['crm', 'company', id, 'contacts'],
      queryFn: () => {
        if (!id) {
          throw new Error('company id is required to fetch contacts');
        }
        return throwOnErr(() =>
          storageServiceClient.getCompanyContacts({ companyId: id })
        );
      },
      staleTime: COMPANY_CONTACTS_STALE_TIME,
      enabled: !!id,
    };
  });
}
