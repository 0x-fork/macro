import type { FacetSelection } from '@app/component/next-soup/filters/facet-store';
import type { SearchIndexId } from '@app/component/next-soup/soup-view/filters-bar/search/search-filters-state';
import type { CategoryFilter } from './types';

type CategorySearchFilters = {
  facets: FacetSelection;
};

// Each Cmd+K category maps to a search-view index type so the resulting
// Type: chip behaves the same as one picked from the filter row. Cmd+K DMs
// maps to the same channels index as Channels for now; channelType-based
// narrowing (DMs vs non-DMs) is left for a follow-up once the search
// backend honors it.
const CATEGORY_TO_INDEX: Partial<Record<CategoryFilter, SearchIndexId>> = {
  channels: 'channels',
  dms: 'channels',
  documents: 'document-or-file',
  tasks: 'task',
  chats: 'agent',
  projects: 'folders',
};

export function getCategorySearchFilters(
  category: CategoryFilter
): CategorySearchFilters | undefined {
  const indexValue = CATEGORY_TO_INDEX[category];
  if (!indexValue) return undefined;

  return {
    facets: {
      scope: ['search-supported'],
      'search-type': [indexValue],
    },
  };
}
