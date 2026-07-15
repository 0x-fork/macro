import type {
  OpenWithSplitOptions,
  SplitContent,
} from '@components/app/split-layout/layoutManager';

export type TagNavigationTarget = {
  optionId: string;
  propertyDefinitionId: string;
};

export function buildTaggedItemsSplitContent(
  tag: TagNavigationTarget
): SplitContent {
  return {
    type: 'component',
    id: 'search',
    preserveParams: true,
    params: {
      initialFacets: {
        scope: ['search-supported'],
        tag: [tag.optionId],
      },
    },
  };
}

export function buildTaggedItemsSplitOptions(
  options: Pick<OpenWithSplitOptions, 'handle'> = {}
): OpenWithSplitOptions {
  return {
    ...options,
    activate: true,
    allowDuplicate: true,
    preferNewSplit: true,
    referredFrom: null,
  };
}
