import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { useDealStages } from '@companies/crm/deal-stages';
import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import {
  ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_FLAG,
  ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_OVERRIDE,
} from '@core/constant/featureFlags';
import { useUserId } from '@core/context/user';
import type { EntityData } from '@entity';
import { useTagsQuery } from '@queries/properties/tags';
import type { SoupAstBody, SoupParams } from '@queries/soup/items';
import {
  entityMatchesTagFilter,
  soupItemMatchesTagFilter,
} from '@queries/soup/tag-filter';
import { mapApiSoupItemToEntity } from '@queries/soup/transform-utils';
import type { SoupApiItem } from '@service-storage/generated/schemas';
import { type Accessor, createMemo } from 'solid-js';
import type { FacetCtx } from '../../filtering/facets';
import type { SoupCollectionControls } from '../create-soup-collection-state';

const API_SORTS = new Set<ApiSortMethod>([
  'viewed_at',
  'created_at',
  'updated_at',
  'viewed_updated',
]);

type ApiSortMethod = Exclude<
  NonNullable<SoupParams['sort_method']>,
  'frecency'
>;

export type ApiSoupParams = Omit<SoupParams, 'sort_method'> & {
  sort_method: ApiSortMethod;
};

/** Builds the reactive request inputs shared by Soup browse transports. */
export function useSoupBrowseRequest(options: {
  controls: SoupCollectionControls;
  enabled?: Accessor<boolean>;
  limit?: Accessor<number>;
}) {
  const { controls } = options;
  const enabled = () => options.enabled?.() ?? true;
  const notificationSource = useGlobalNotificationSource();
  const userId = useUserId();
  const dealStages = useDealStages();
  const tagsQuery = useTagsQuery();
  const supportedForeignEntities = useFeatureFlag(
    ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_FLAG,
    { enabledOverride: ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_OVERRIDE }
  );

  const tagDefinitions = createMemo(() => {
    const definitions = new Map<string, string>();
    for (const set of tagsQuery.data ?? []) {
      for (const option of set.options) {
        definitions.set(option.id, option.propertyDefinitionId);
      }
    }
    return definitions;
  });

  const tagMode = (): 'any' | 'all' =>
    controls.facets.has('tag_mode', 'all') ? 'all' : 'any';

  const facetContext = createMemo(
    (): FacetCtx => ({
      userId: userId(),
      notificationSource,
      assignees: controls.facets.getSelected('assignee'),
      tagDefs: tagDefinitions(),
      tagMode: tagMode(),
      resolveCompanyStage: (entity) =>
        dealStages.resolveStage(
          entity as Parameters<typeof dealStages.resolveStage>[0]
        ),
    })
  );

  const soupBody = createMemo(
    (): SoupAstBody => ({
      ...controls.facets.compile(facetContext()),
      ...(controls.state.emailView
        ? { emailView: controls.state.emailView }
        : {}),
    })
  );

  const soupParams = createMemo((): ApiSoupParams => {
    const requested = controls.state.sort[0]?.id ?? 'updated_at';
    return {
      limit: options.limit?.() ?? 100,
      sort_method: API_SORTS.has(requested as ApiSortMethod)
        ? (requested as ApiSortMethod)
        : 'created_at',
    };
  });

  const activeTagIds = () => controls.facets.getSelected('tag');

  const matchesActiveFilters = (item: SoupApiItem) =>
    soupItemMatchesTagFilter(item, activeTagIds(), tagMode()) &&
    controls.facets.test(mapApiSoupItemToEntity(item), facetContext());

  const matchesEntityFilters = (entity: EntityData) =>
    controls.facets.test(entity, facetContext()) &&
    entityMatchesTagFilter(entity, activeTagIds(), tagMode());

  return {
    enabled,
    notificationSource,
    dealStages,
    facetContext,
    soupBody,
    soupParams,
    matchesActiveFilters,
    matchesEntityFilters,
    showSupportedForeignEntities: () => supportedForeignEntities().enabled,
  };
}
