import type { CrmCompanyEntity } from '@entity';

// TODO: render the company's email threads via ListEntity once a backend
// query for company-scoped emails exists.
export function CompanyEmailsSection(_props: { company?: CrmCompanyEntity }) {
  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-sm font-medium text-ink-muted">Emails</h2>
      <div class="rounded-lg border border-dashed border-edge-muted p-6 text-center text-sm text-ink-muted">
        Email threads for this company will appear here once the backend query
        is available.
      </div>
    </div>
  );
}
