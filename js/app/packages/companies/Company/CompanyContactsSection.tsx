import type { CrmCompanyEntity } from '@entity';
import { For, Show } from 'solid-js';
import { useCompanyContactsQuery } from './use-company-contacts-query';

export function CompanyContactsSection(props: { company?: CrmCompanyEntity }) {
  const companyId = () => props.company?.id;
  const contactsQuery = useCompanyContactsQuery(companyId);
  const contacts = () => contactsQuery.data ?? [];

  return (
    <Show
      when={props.company && !contactsQuery.isLoading}
      fallback={<div class="text-sm text-ink-muted">Loading…</div>}
    >
      <Show
        when={contacts().length > 0}
        fallback={<div class="text-sm text-ink-muted">No contacts yet.</div>}
      >
        <div class="flex flex-col gap-2">
          <For each={contacts()}>
            {(contact) => (
              <div class="flex min-w-0 flex-col gap-0.5">
                <span class="truncate text-sm">
                  {contact.name ?? contact.email}
                </span>
                <Show when={contact.name}>
                  <span class="truncate text-xs text-ink-muted">
                    {contact.email}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Show>
  );
}
