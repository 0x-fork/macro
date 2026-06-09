import { throwOnErr } from '@core/util/result';
import type { CrmCompanyEntity } from '@entity';
import { storageServiceClient } from '@service-storage/client';
import type { CrmCompanyResponse } from '@service-storage/generated/schemas/crmCompanyResponse';
import type { CrmContactResponse } from '@service-storage/generated/schemas/crmContactResponse';
import { useQuery } from '@tanstack/solid-query';
import { type Accessor, createMemo } from 'solid-js';

const COMPANY_STALE_TIME = 60 * 1000;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** A contact row as embedded in the company response. */
export type CompanyContact = CrmContactResponse;

/**
 * Fetches a single CRM company by id via `GET /crm/companies/{id}`.
 * The endpoint is role-aware via [`CrmCompanyAccessLevelExtractor`]:
 * non-admin viewers 404 on hidden rows, admin/owner reach hidden rows
 * for unhide UI. Contacts arrive embedded in the response so the
 * company panel hydrates in a single round trip.
 *
 * Disabled until a non-NIL companyId is available so callers can pass
 * a sentinel placeholder before their own data loads without firing a
 * doomed 404.
 */
export function useCompanyQuery(companyId: Accessor<string>) {
  const query = useQuery(() => {
    const id = companyId();
    return {
      queryKey: ['crm', 'company', id],
      queryFn: () => {
        if (!id) {
          throw new Error('company id is required to fetch company');
        }
        return throwOnErr(() =>
          storageServiceClient.getCompany({ companyId: id })
        );
      },
      staleTime: COMPANY_STALE_TIME,
      enabled: !!companyId() && companyId() !== NIL_UUID,
    };
  });

  const company = createMemo<CrmCompanyEntity | undefined>(() => {
    const data = query.data;
    if (!data) return undefined;
    return responseToEntity(data);
  });

  const contacts = createMemo<CompanyContact[]>(
    () => query.data?.contacts ?? []
  );

  return { query, company, contacts };
}

function responseToEntity(response: CrmCompanyResponse): CrmCompanyEntity {
  return {
    type: 'crm_company',
    id: response.id,
    // CrmCompanyEntity.name is a required string; the wire schema's
    // primary-directory `name` is nullable. Fall back to the primary
    // domain (or empty) so consumers don't have to special-case.
    name: response.name ?? response.domains[0]?.domain ?? '',
    // Companies are team-owned, not user-owned. The entity's ownerId
    // slot is preserved for shape parity with other EntityBase types.
    ownerId: '',
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
    teamId: response.teamId,
    description: response.description ?? undefined,
    emailSync: response.emailSync,
    hidden: response.hidden,
    domains: response.domains.map((d) => ({
      id: d.id,
      companyId: d.companyId,
      domain: d.domain,
      createdAt: d.createdAt,
    })),
  };
}
