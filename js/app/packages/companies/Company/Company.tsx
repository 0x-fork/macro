import { SidePanel } from '@app/component/side-panel';
import { CompanyContactsSection } from './CompanyContactsSection';
import { CompanyDiscussionSection } from './CompanyDiscussionSection';
import { CompanyEmailsSection } from './CompanyEmailsSection';
import { CompanyHeader } from './CompanyHeader';
import { CompanyMetadataSection } from './CompanyMetadataSection';
import { CompanyReferencesSection } from './CompanyReferencesSection';
import { useCompanyQuery } from './use-company-query';

/**
 * Root of the company detail view. Owns the company query and pushes the
 * resolved entity down to presentational children. Layout mirrors the task
 * page: middle content constrained to a centered column, additional info in
 * the right-hand SidePanel.
 */
export function Company(props: { companyId: string }) {
  const { company } = useCompanyQuery(() => props.companyId);

  return (
    <SidePanel.Layout>
      <div class="flex h-full flex-col overflow-y-auto scrollbar-hidden">
        <div class="mx-auto flex w-full max-w-3xl min-w-0 grow flex-col gap-6 px-6 pt-12 pb-12">
          <CompanyHeader company={company()} />
          <CompanyEmailsSection company={company()} />
          <CompanyDiscussionSection companyId={props.companyId} />
        </div>
      </div>

      <SidePanel.Section
        id="company-details"
        title="Details"
        order={10}
        defaultOpen
      >
        <CompanyMetadataSection company={company()} />
      </SidePanel.Section>
      <SidePanel.Section
        id="company-contacts"
        title="Contacts"
        order={20}
        defaultOpen
      >
        <CompanyContactsSection company={company()} />
      </SidePanel.Section>
      <SidePanel.Section id="company-references" title="References" order={30}>
        <CompanyReferencesSection company={company()} />
      </SidePanel.Section>
    </SidePanel.Layout>
  );
}
