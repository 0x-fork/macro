import { throwOnErr } from '@core/util/result';
import { queryClient } from '@queries/client';
import { crmKeys } from '@queries/crm/keys';
import { soupKeys } from '@queries/soup/keys';
import { storageServiceClient } from '@service-storage/client';
import { useMutation } from '@tanstack/solid-query';

/**
 * Toggles `crm_companies.email_sync` via `PUT /crm/companies/{id}/email-sync`.
 * Purely a read-side visibility gate controlling whether the team can see each
 * other's emails with this company — existing CRM data is never destroyed and
 * re-enabling needs no backfill.
 */
export function useSetEmailSyncMutation() {
  return useMutation(() => ({
    mutationFn: ({
      companyId,
      emailSync,
    }: {
      companyId: string;
      emailSync: boolean;
    }) =>
      throwOnErr(() =>
        storageServiceClient.setEmailSync({ companyId, emailSync })
      ),
    // Return the invalidation promise so the mutation stays pending until the
    // refetches resolve — the company entity, empty-state message, and emails
    // list flip in one beat. Soup carries the team-wide email visibility change;
    // the company detail query backs the panel's `emailSync` empty-state text.
    onSuccess: (_data, { companyId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: soupKeys._def }),
        queryClient.invalidateQueries({
          queryKey: crmKeys.company(companyId).queryKey,
        }),
      ]),
  }));
}
