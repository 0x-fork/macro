import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { type CrmCompanyEntity, ListEntity, ListLayoutProvider } from '@entity';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useCompanyEmailsQuery } from './use-company-emails-query';

export function CompanyEmailsSection(props: { company?: CrmCompanyEntity }) {
  const domains = createMemo(
    () => props.company?.domains.map((domain) => domain.domain) ?? []
  );
  const emailsQuery = useCompanyEmailsQuery(domains);
  const emails = () => emailsQuery.data?.entities ?? [];

  const [listRef, setListRef] = createSignal<HTMLElement>();

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-sm font-medium text-ink-muted">Emails</h2>
      <Show
        when={props.company && !emailsQuery.isLoading}
        fallback={
          <div class="p-6 text-center text-sm text-ink-muted">Loading…</div>
        }
      >
        <Show
          when={emails().length > 0}
          fallback={
            <div class="rounded-lg border border-dashed border-edge-muted p-6 text-center text-sm text-ink-muted">
              No emails with this company yet.
            </div>
          }
        >
          <ListLayoutProvider ref={listRef}>
            <div ref={setListRef} class="flex flex-col">
              <For each={emails()}>
                {(entity) => (
                  <ListEntity
                    entity={entity}
                    timestamp={entity.updatedAt}
                    onClick={() => openEntityInSplitFromUnifiedList(entity, {})}
                  />
                )}
              </For>
            </div>
          </ListLayoutProvider>
        </Show>
      </Show>
    </div>
  );
}
