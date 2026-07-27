import type { ListView } from '@app/constants/list-views';
import type { EntityData } from '@entity';
import type { Accessor } from 'solid-js';
import { ALL_FACETS } from '../filters/facets';
import type {
  CreateSoupCollectionStateOptions,
  SoupCollectionControls,
} from './create-soup-collection-state';
import { createSoupCollectionState } from './create-soup-collection-state';
import { createSoupDataSource } from './data-source/create-soup-data-source';
import { SORT_CONFIGS } from './sort-config';

export type SoupCollection = SoupCollectionControls & {
  dataSource: ReturnType<typeof createSoupDataSource>;
  reset: () => void;
};

export type CreateSoupCollectionOptions = CreateSoupCollectionStateOptions & {
  view: ListView;
  enabled?: Accessor<boolean>;
  additionalEntities?: Accessor<EntityData[]>;
  disableLocalSearch?: Accessor<boolean>;
  limit?: Accessor<number>;
};

/** Owns one Soup collection's controls and all concrete data sources. */
export function createSoupCollection(
  options: CreateSoupCollectionOptions
): SoupCollection {
  const state = createSoupCollectionState({
    facets: options.facets ?? ALL_FACETS,
    sortConfigs: options.sortConfigs ?? SORT_CONFIGS,
    persistence: options.persistence,
    initialState: {
      ...options.initialState,
      sort: options.initialState?.sort ?? ['updated_at'],
    },
  });
  const dataSource = createSoupDataSource({
    view: options.view,
    controls: state,
    enabled: options.enabled,
    additionalEntities: options.additionalEntities,
    disableLocalSearch: options.disableLocalSearch,
    limit: options.limit,
    sortConfigs: options.sortConfigs ?? SORT_CONFIGS,
  });
  return {
    ...state,
    dataSource,
  };
}
