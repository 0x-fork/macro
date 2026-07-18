import type { SoupCollection } from '@app/features/soup-list';
import { isSearchTaggableType } from '@app/features/soup-list/search-type-capabilities';
import { batch } from 'solid-js';

export type SoupSearchType =
  | 'all'
  | 'email'
  | 'channels'
  | 'calls'
  | 'task'
  | 'document-or-file'
  | 'folders'
  | 'agent'
  | 'doc-snippet'
  | 'github-pr';

export const SEARCH_SECTION_FACETS = {
  all: ['tag', 'tag_mode'],
  email: ['email_importance', 'email_inbox', 'tag', 'tag_mode'],
  channels: ['channel_in', 'channel_from'],
  calls: ['call_in', 'call_from', 'call_status', 'tag', 'tag_mode'],
  task: [
    'task_status',
    'task_priority',
    'assignee',
    'task_created_by',
    'tag',
    'tag_mode',
  ],
  'document-or-file': ['tag', 'tag_mode'],
  folders: ['tag', 'tag_mode'],
  agent: ['tag', 'tag_mode'],
  'doc-snippet': ['tag', 'tag_mode'],
  'github-pr': ['tag', 'tag_mode'],
} as const satisfies Record<SoupSearchType, readonly string[]>;

const ALL_SECTION_FACETS = [
  ...new Set(Object.values(SEARCH_SECTION_FACETS).flat()),
];

type Facets = SoupCollection['facets'];
type Section = Record<string, string[]>;

const capture = (facets: Facets, ids: readonly string[]): Section =>
  Object.fromEntries(
    ids.flatMap((id) => {
      const selected = facets.getSelected(id);
      return selected.length > 0 ? [[id, [...selected]]] : [];
    })
  );

const selectedType = (facets: Facets): SoupSearchType =>
  (facets.getSelected('search_type')[0] as SoupSearchType | undefined) ?? 'all';

export function sanitizeSearchTypeAvailability(
  type: SoupSearchType,
  availability: {
    snippets: boolean;
    githubPr?: boolean;
  }
): SoupSearchType {
  if (type === 'doc-snippet' && !availability.snippets) return 'all';
  if (type === 'github-pr' && availability.githubPr === false) return 'all';
  return type;
}

export function normalizeSearchFacets(facets: Facets) {
  const activeType = selectedType(facets);
  const activeIds = new Set<string>(SEARCH_SECTION_FACETS[activeType]);
  for (const id of ALL_SECTION_FACETS) {
    if (!activeIds.has(id)) facets.set(id, []);
  }
  if (!isSearchTaggableType(activeType)) {
    facets.set('tag', []);
    facets.set('tag_mode', []);
  }
}

export function createSearchFacetController(facets: Facets) {
  const stashes = new Map<SoupSearchType, Section>();
  const type = (): SoupSearchType => selectedType(facets);

  const clearSections = () => {
    for (const id of ALL_SECTION_FACETS) facets.set(id, []);
  };

  const restore = (section: Section | undefined) => {
    for (const [id, selected] of Object.entries(section ?? {})) {
      facets.set(id, selected);
    }
  };

  const setType = (next: SoupSearchType) => {
    const previous = type();
    if (previous === next) return;

    stashes.set(previous, capture(facets, SEARCH_SECTION_FACETS[previous]));
    const sharedTags =
      isSearchTaggableType(previous) && isSearchTaggableType(next)
        ? capture(facets, ['tag', 'tag_mode'])
        : undefined;

    batch(() => {
      clearSections();
      facets.set('search_type', next === 'all' ? [] : [next]);
      restore(stashes.get(next));
      restore(sharedTags);
      normalizeSearchFacets(facets);
    });
  };

  normalizeSearchFacets(facets);

  return { type, setType, normalize: () => normalizeSearchFacets(facets) };
}
