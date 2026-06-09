import { throwOnErr } from '@core/util/result';
import { storageServiceClient } from '@service-storage/client';
import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';

const CONTACT_STALE_TIME = 60 * 1000;

/**
 * Fetches a single CRM contact by id via `GET /crm/contacts/{id}`.
 * The endpoint is role-aware: admins/owners see hidden contacts too,
 * non-admins get 404 on hidden rows. The frontend doesn't branch — it
 * just calls the endpoint and trusts the response.
 */
export function useContactQuery(contactId: Accessor<string>) {
  return useQuery(() => {
    const id = contactId();
    return {
      queryKey: ['crm', 'contact', id],
      queryFn: () => {
        if (!id) {
          throw new Error('contact id is required to fetch contact');
        }
        return throwOnErr(() =>
          storageServiceClient.getContact({ contactId: id })
        );
      },
      staleTime: CONTACT_STALE_TIME,
      enabled: !!id,
    };
  });
}
