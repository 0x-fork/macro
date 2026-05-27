import type { CrmCompanyEntity } from '@entity';

// TODO: render the company's contacts via ListEntity once a backend query for
// company-scoped contacts exists.
export function CompanyContactsSection(_props: { company?: CrmCompanyEntity }) {
  return (
    <div class="text-sm text-ink-muted">
      Contacts for this company will appear here once the backend query is
      available.
    </div>
  );
}
