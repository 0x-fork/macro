import type { MacroClient } from '../../utils/client';
import { Company } from './company';
import { Contact } from './contact';

export class CrmNamespace {
  constructor(private readonly client: MacroClient) {}

  /** A handle to a CRM company by id. */
  companyById(id: string): Company {
    return Company.byId(this.client, id);
  }

  /** A handle to a CRM contact by id. */
  contactById(id: string): Contact {
    return Contact.byId(this.client, id);
  }

  /** Search CRM companies by name/domain, most relevant first, auto-paginated. */
  searchCompanies(query: string): AsyncGenerator<Company> {
    return Company.search(this.client, query);
  }
}
