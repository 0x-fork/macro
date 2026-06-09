import { throwOnErr } from '@core/util/result';
import { queryClient } from '@queries/client';
import { soupKeys } from '@queries/soup/keys';
import { storageServiceClient } from '@service-storage/client';
import { useMutation } from '@tanstack/solid-query';

/**
 * Toggles `crm_companies.hidden` via `PUT /crm/companies/{id}/hidden`. Hiding
 * also disables `email_sync` and soft-hides the company's contacts; un-hide
 * restores contact visibility (contact rows and sources survive the cycle).
 * Invalidates soup (the company drops out of / returns to the listings) and the
 * company detail query so an open panel reflects the new hidden/email-sync state.
 */
export function useSetCompanyHiddenMutation() {
  return useMutation(() => ({
    mutationFn: ({
      companyId,
      hidden,
    }: {
      companyId: string;
      hidden: boolean;
    }) =>
      throwOnErr(() =>
        storageServiceClient.setCompanyHidden({ companyId, hidden })
      ),
    onSuccess: (_data, { companyId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: soupKeys._def }),
        queryClient.invalidateQueries({
          queryKey: ['crm', 'company', companyId],
        }),
      ]),
  }));
}
