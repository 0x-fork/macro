import { useSplitLayout } from '@app/component/split-layout/layout';
import { useCompanyQuery } from '@companies/Company/use-company-query';
import type { CrmContactResponse } from '@service-storage/generated/schemas/crmContactResponse';
import { type JSX, Show } from 'solid-js';

// Sentinel for when the contact (and thus its companyId) hasn't loaded
// yet — useCompanyQuery's `enabled` gate excludes the nil UUID so no
// doomed 404 fires, and the query re-runs once the real companyId
// arrives.
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

function Field(props: { label: string; children: JSX.Element }) {
  return (
    <div class="flex flex-col gap-0.5">
      <span class="text-xs text-ink-muted">{props.label}</span>
      <div class="text-sm">{props.children}</div>
    </div>
  );
}

export function ContactMetadataSection(props: {
  contact?: CrmContactResponse;
}) {
  const { replaceOrInsertSplit } = useSplitLayout();
  const { company } = useCompanyQuery(
    () => props.contact?.companyId ?? NIL_UUID
  );

  const openCompany = (companyId: string) => {
    replaceOrInsertSplit({ type: 'company', id: companyId });
  };

  return (
    <Show
      when={props.contact}
      fallback={<div class="text-sm text-ink-muted">Loading…</div>}
    >
      {(contact) => (
        <div class="flex flex-col gap-3">
          <Field label="Email">
            <span class="truncate">{contact().email}</span>
          </Field>
          <Field label="Company">
            <button
              type="button"
              onClick={() => openCompany(contact().companyId)}
              class="text-left text-sm text-accent hover:underline"
            >
              {company()?.name ?? 'Open company'}
            </button>
          </Field>
        </div>
      )}
    </Show>
  );
}
