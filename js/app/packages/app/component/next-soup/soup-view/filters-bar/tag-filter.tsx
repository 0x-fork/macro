import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import {
  ENABLE_TAGS_FE_FLAG,
  ENABLE_TAGS_FE_OVERRIDE,
} from '@core/constant/featureFlags';
import { TagDot } from '@property/tags/TagDot';
import { useTagsQuery } from '@queries/properties/tags';
import { createMemo } from 'solid-js';
import type { SearchableOption } from './searchable-multi-select';

/**
 * The caller's tags as pickable options, plus the flag/availability gating.
 * Shared by every tag-filter surface (search facet, filter dropdown, chip bar)
 * so option labels, colors, and the owning-definition mapping stay in sync.
 */
export function useTagOptions() {
  const tagsFlag = useFeatureFlag(ENABLE_TAGS_FE_FLAG, {
    enabledOverride: ENABLE_TAGS_FE_OVERRIDE,
  });
  const tagsQuery = useTagsQuery();

  const defByOption = createMemo(() => {
    const map = new Map<string, string>();
    for (const set of tagsQuery.data ?? []) {
      for (const option of set.options) {
        map.set(option.id, option.propertyDefinitionId);
      }
    }
    return map;
  });

  const options = createMemo<SearchableOption[]>(() =>
    (tagsQuery.data ?? []).flatMap((set) =>
      set.options.map((option) => ({
        id: option.id,
        label: option.value.type === 'string' ? option.value.value : option.id,
        icon: () => <TagDot color={option.color ?? undefined} />,
      }))
    )
  );

  const optionsById = createMemo(() => {
    const map = new Map<string, SearchableOption>();
    for (const option of options()) map.set(option.id, option);
    return map;
  });

  const enabled = () => tagsFlag().enabled;
  const hasTags = () => options().length > 0;

  return { enabled, hasTags, options, optionsById, defByOption };
}

/**
 * Tag-filter state for the list-view surfaces (the filter dropdown and the
 * active-filters chip bar). Selected tag option ids live in the `tag` facet;
 * the soup list rebuilds property filters from them (via the tag definitions)
 * and the search request maps them to option ids alone. Multiple tags OR
 * together across definitions.
 */
export function useTagFilter() {
  const { soup } = useSoupView();
  const tags = useTagOptions();

  const activeIds = createMemo(() => soup.facets.getSelected('tag'));
  const onChange = (ids: string[]) => soup.facets.set('tag', ids);

  return {
    enabled: tags.enabled,
    hasTags: tags.hasTags,
    options: tags.options,
    optionsById: tags.optionsById,
    activeIds,
    onChange,
  };
}
