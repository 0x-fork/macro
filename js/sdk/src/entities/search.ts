import type {
  EntityFilters,
  UnifiedSearchResponseItem,
} from '../../generated/search/types.gen';
import { MacroError, paginate, unwrap } from '../utils';
import type { MacroClient } from '../utils/client';

type Hit = UnifiedSearchResponseItem;

/**
 * Build a `search(client, query)` function for one entity type: unified
 * search restricted by `filters`, hits narrowed to `type`, each mapped
 * through `make`. Most relevant first, auto-paginated.
 */
export function entitySearch<T, K extends Hit['type']>(opts: {
  filters: EntityFilters;
  type: K;
  make: (client: MacroClient, hit: Extract<Hit, { type: K }>) => T;
  /** Opt in to CRM results (off by default server-side; required for company hits). */
  includeCrm?: boolean;
}): (client: MacroClient, query: string) => AsyncGenerator<T> {
  const { filters, type, make, includeCrm } = opts;
  return (client, query) => {
    if (query.trim().length < 3) {
      throw new MacroError('search query must be at least 3 characters');
    }
    return paginate(async (cursor) => {
      const { results, next_cursor } = unwrap(
        await client.search.unifiedSearch({
          body: {
            query,
            match_type: 'partial',
            search_on: 'name_content',
            filters,
            ...(includeCrm ? { include_crm: true } : {}),
          },
          query: {
            page_size: 20,
            ...(cursor ? { cursor } : {}),
          },
        }),
      );
      const hits = results.filter(
        (r): r is Extract<Hit, { type: K }> => r.type === type,
      );
      return {
        items: hits.map((h) => make(client, h)),
        nextCursor: next_cursor,
      };
    });
  };
}
