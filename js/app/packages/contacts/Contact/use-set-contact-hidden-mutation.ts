import { throwOnErr } from '@core/util/result';
import { queryClient } from '@queries/client';
import { soupKeys } from '@queries/soup/keys';
import { storageServiceClient } from '@service-storage/client';
import { useMutation } from '@tanstack/solid-query';

/**
 * Toggles `crm_contacts.hidden` via `PUT /crm/contacts/{id}/hidden`.
 * Hidden contacts disappear from the parent company's contact list
 * (non-admin view) and from any soup surface that filters them.
 *
 * Returns the invalidation promise from `onSuccess` so the mutation
 * stays pending until both the contact query and the soup queries
 * refetch — the toggle state and any dependent UI all flip in one beat.
 */
export function useSetContactHiddenMutation() {
  return useMutation(() => ({
    mutationFn: ({
      contactId,
      hidden,
    }: {
      contactId: string;
      hidden: boolean;
    }) =>
      throwOnErr(() =>
        storageServiceClient.setContactHidden({ contactId, hidden })
      ),
    onSuccess: (_data, { contactId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: soupKeys._def }),
        queryClient.invalidateQueries({
          queryKey: ['crm', 'contact', contactId],
        }),
      ]),
  }));
}
