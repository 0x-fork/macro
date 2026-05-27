import type { CrmCompanyEntity } from '@entity';

// TODO: wire inbound references (channel messages + documents) once the
// references backend supports the crm_company entity type.
export function CompanyReferencesSection(_props: {
  company?: CrmCompanyEntity;
}) {
  return (
    <div class="text-sm text-ink-muted">
      References to this company will appear here once supported by the
      references backend.
    </div>
  );
}
