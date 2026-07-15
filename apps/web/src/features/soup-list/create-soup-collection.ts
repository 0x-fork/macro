import { SORT_CONFIGS } from '@app/features/next-soup/soup-view/sort-options';
import type { EntityData } from '@entity';
import type { Accessor } from 'solid-js';
import type {
  CreateSoupCollectionStateOptions,
  SoupCollectionControls,
  SoupCollectionState,
} from './create-soup-collection-state';
import { createSoupCollectionState } from './create-soup-collection-state';
import {
  type CreateSoupDataSourceOptions,
  createSoupDataSource,
} from './create-soup-data-source';
import { ALL_FACETS } from './facets';

export type SoupCollectionStatus = ReturnType<
  typeof createSoupDataSource
>['status'];

export type SoupCollection = SoupCollectionControls & {
  dataSource: Omit<ReturnType<typeof createSoupDataSource>, 'status'>;
  status: SoupCollectionStatus;
  reset: () => void;
};

export type CreateSoupCollectionOptions = CreateSoupCollectionStateOptions &
  Pick<CreateSoupDataSourceOptions, 'scopeNotifications' | 'isClientGroup'> & {
    enabled?: Accessor<boolean>;
    additionalEntities?: Accessor<EntityData[]>;
    disableLocalSearch?: Accessor<boolean>;
  };

/** Owns one Soup collection's controls and all concrete data sources. */
export function createSoupCollection(
  options: CreateSoupCollectionOptions
): SoupCollection {
  const state: SoupCollectionState = createSoupCollectionState({
    ...options,
    facets: options.facets ?? ALL_FACETS,
    sortConfigs: options.sortConfigs ?? SORT_CONFIGS,
    initialSortIds: options.initialSortIds ?? ['updated_at'],
  });
  const source = createSoupDataSource({
    controls: state,
    enabled: options.enabled,
    additionalEntities: options.additionalEntities,
    disableLocalSearch: options.disableLocalSearch,
    scopeNotifications: options.scopeNotifications,
    isClientGroup: options.isClientGroup,
    sortConfigs: options.sortConfigs ?? SORT_CONFIGS,
  });
  const { status, ...dataSource } = source;

  return {
    ...state,
    dataSource,
    status,
  };
}
