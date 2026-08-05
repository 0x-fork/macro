import { useCompanyQuery } from '@queries/crm/companies';
import { useCrmCompanyIdForDomainQuery } from '@queries/crm/company-for-domain';
import { type Accessor, createMemo } from 'solid-js';
import { addressDomain } from './parties';

/**
 * The caller's team CRM company for an email domain, with its contacts.
 *
 * Two hops — domain → company id (unified search), then id → company +
 * contacts — both cached by TanStack Query, so the rows in a panel that all
 * share one domain issue one pair of requests between them.
 */
export function useCrmCompanyForDomain(domain: Accessor<string | undefined>) {
  const companyIdQuery = useCrmCompanyIdForDomainQuery(domain);
  const companyId = () => companyIdQuery.data ?? '';
  const { query, company, contacts } = useCompanyQuery(companyId);

  return {
    company,
    contacts,
    /** True while either hop is still in flight. */
    isLoading: () =>
      companyIdQuery.isLoading || (!!companyId() && query.isLoading),
  };
}

/**
 * The CRM contact record for a single address, resolved through the company
 * that owns its domain. `contact` stays `undefined` when the team tracks no
 * company for the domain, or tracks the company but not this address.
 */
export function useCrmContactForAddress(email: Accessor<string>) {
  const domain = createMemo(() => addressDomain(email()));
  const { company, contacts, isLoading } = useCrmCompanyForDomain(domain);

  const contact = createMemo(() => {
    const target = email().trim().toLowerCase();
    if (!target) return undefined;
    return contacts().find(
      (candidate) => candidate.email.trim().toLowerCase() === target
    );
  });

  return { contact, company, isLoading };
}
