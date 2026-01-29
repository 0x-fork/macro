import {
  createSoupState,
  type SoupState,
} from '@app/component/next-soup/create-soup-state';
import { buildDssFiltersRequest } from '@app/component/next-unified-list/filters/filters';
import { useSoupQuery } from '@app/component/next-unified-list/soup-query/use-soup-query';
import { arrayEquals } from '@core/util/compareUtils';
import { debouncedDependent } from '@core/util/debounce';
import { fuzzyMatch } from '@core/util/fuzzy';
import type { EntityData, WithSearch } from '@macro-entity';
import type { SearchArgs } from '@service-search/client';
import type { UnifiedSearchIndex } from '@service-search/generated/models';
import {
  type Accessor,
  createContext,
  createMemo,
  createRenderEffect,
  createSignal,
  type FlowComponent,
  on,
  Suspense,
  useContext,
} from 'solid-js';

const SEARCH_SERVICE_DEBOUNCE_MS = 300;
const LOCAL_FUZZY_SEARCH_DEBOUNCE_MS = 20;

type Row<T> = {
  original: T;
  depth: number;
  isSelected: () => boolean;
  isExpanded: () => boolean;
  isGrouped: () => boolean;
  isFocused: () => boolean;
  toggleExpanded: (expanded?: boolean) => void;
};

export type SoupRow = Row<SoupEntity>;

export type SoupEntity = EntityData | WithSearch<EntityData>;

interface SoupViewContextValues {
  soup: SoupState;
  query: any;
  searchText: Accessor<string>;
  setSearchText: (value: string) => void;
  isSearchDisabled: Accessor<boolean>;
  rows: Accessor<SoupRow[]>;
}

export const SoupViewContext = createContext<SoupViewContextValues>();

export const useSoupView = () => {
  const context = useContext(SoupViewContext);

  if (!context) {
    throw new Error(
      'useSoupView can only be used under a SoupViewContext.Provider'
    );
  }

  return context;
};

export const useMaybeSoupView = () => useContext(SoupViewContext);

interface SoupViewContextProviderProps {
  soup?: SoupState;
}

export const SoupViewContextProvider: FlowComponent<
  SoupViewContextProviderProps
> = (props) => {
  const soup = props.soup ?? createSoupState();

  const [searchText, setSearchText] = createSignal('');

  const debouncedSearchForLocal = debouncedDependent(
    searchText,
    LOCAL_FUZZY_SEARCH_DEBOUNCE_MS
  );

  const debouncedSearchForService = debouncedDependent(
    searchText,
    SEARCH_SERVICE_DEBOUNCE_MS
  );

  const unifiedSearchIncludeArray = createMemo<UnifiedSearchIndex[]>(
    () => {
      let types = soup.filters.activeIds();
      // NOTE: empty array means search all
      if (types.length === 0) types = [];
      const includeArray: UnifiedSearchIndex[] = [];
      for (const type of types) {
        switch (type) {
          case 'document':
          case 'task':
            includeArray.push('documents');
            break;
          case 'chat':
            includeArray.push('chats');
            break;
          case 'channel':
            includeArray.push('channels');
            break;
          case 'email':
            includeArray.push('emails');
            break;
          case 'project':
            includeArray.push('projects');
            break;
        }
      }
      return Array.from(new Set(includeArray));
    },
    [],
    { equals: arrayEquals }
  );

  const validSearchTerms = createMemo(
    () => debouncedSearchForService().length >= 3
  );
  const isSearchDisabled = createMemo(() => !validSearchTerms());

  const searchUnifiedNameContentQueryParams = createMemo(
    (prev: SearchArgs | undefined): SearchArgs => {
      if (prev && prev.request.terms?.[0] === debouncedSearchForService()) {
        return prev;
      }

      return {
        params: {
          cursor: null,
          page_size: 100,
        },
        request: {
          search_on: 'name_content',
          match_type: 'partial',
          terms:
            debouncedSearchForService().length > 0
              ? [debouncedSearchForService()]
              : undefined,
          // filters: unifiedSearchFilters(),
          include: unifiedSearchIncludeArray(),
        },
      };
    }
  );

  const query = useSoupQuery(() => ({
    params: {},
    body: {
      ...buildDssFiltersRequest(soup.filters.active()),
      limit: 100,
      search: {
        ...searchUnifiedNameContentQueryParams().request,
      },
    },
  }));

  const nameFuzzySearchFilter = (items: EntityData[]) => {
    const query = debouncedSearchForLocal();
    if (!query || query.length === 0) return items;

    const matchResults = fuzzyMatch(query, items, (item) => item.name);

    return matchResults.map((result) => {
      return {
        ...result.item,
        search: {
          nameHighlight: result.nameHighlight,
          contentHitData: null,
          source: 'local',
        },
      } as WithSearch<EntityData>;
    });
  };

  const attachMethods = (entity: EntityData, depth = 0): SoupRow => {
    return {
      original: entity,
      depth,
      isFocused() {
        return soup.focus.id() === entity.id;
      },
      isSelected() {
        return soup.selection.isSelected(entity.id);
      },
      isGrouped() {
        return soup.selection.isSelected(entity.id);
      },
      isExpanded() {
        return soup.selection.isSelected(entity.id);
      },
      toggleExpanded() {
        return soup.selection.isSelected(entity.id);
      },
    };
  };

  const entities = () => {
    const data = query.data;

    if (!data) return [];

    const filters = soup.filters.active();

    let transformed = data;

    for (const filter of filters) {
      transformed = transformed.filter(filter.predicate);
    }

    if (searchText().length > 0 && searchText().length < 3) {
      transformed = nameFuzzySearchFilter(transformed);
    }

    const sort = soup.sort()[0];

    if (sort) {
      transformed = transformed.toSorted(sort.fn);
    }

    return transformed;
  };

  const rows = () => {
    return entities().map((e) => attachMethods(e));
  };

  const context = {
    soup,
    query,
    rows,
    searchText,
    setSearchText,
    isSearchDisabled,
  };

  return (
    <SoupViewContext.Provider value={context}>
      {props.children}
      <Suspense>
        <SyncWithSoup soup={soup} entities={entities()} />
      </Suspense>
    </SoupViewContext.Provider>
  );
};

interface SyncWithSoupProps {
  soup: SoupState;
  entities: SoupEntity[];
}

const SyncWithSoup = (props: SyncWithSoupProps) => {
  createRenderEffect(on(() => props.entities, props.soup.setData));

  return null;
};
