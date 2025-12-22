import {
  useGlobalBlockOrchestrator,
  useGlobalNotificationSource,
} from '@app/component/GlobalAppState';
import type { BlockChannelProps } from '@block-channel/component/Block';
import { URL_PARAMS as CHANNEL_PARAMS } from '@block-channel/constants';
import { URL_PARAMS as EMAIL_PARAMS } from '@block-email/constants';
import { URL_PARAMS as MD_PARAMS } from '@block-md/constants';
import { URL_PARAMS as PDF_PARAMS } from '@block-pdf/signal/location';
import { SegmentedControl } from '@core/component/FormControls/SegmentControls';
import { ToggleButton } from '@core/component/FormControls/ToggleButton';
import { IconButton } from '@core/component/IconButton';
import {
  ContextMenuContent,
  MENU_CONTENT_CLASS,
  MenuItem,
  MenuSeparator,
} from '@core/component/Menu';
import { getSuggestedProperties } from '@core/component/Properties/utils';
import { getRecipientOptionEmail } from '@core/component/RecipientSelector';
import {
  RecipientTypeahead,
  type RecipientTypeaheadHandle,
} from '@core/component/RecipientTypeahead';
import { ScopedPortal } from '@core/component/ScopedPortal';
import {
  blockAcceptsFileExtension,
  fileTypeToBlockName,
} from '@core/constant/allBlocks';
import { ENABLE_PREVIEW } from '@core/constant/featureFlags';
import { IS_MAC } from '@core/constant/isMac';
import { useEmailLinksStatus } from '@core/email-link';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import { isMobileWidth } from '@core/mobile/mobileWidth';
import { useCombinedRecipients } from '@core/signal/useCombinedRecipient';
import { debouncedDependent } from '@core/util/debounce';
import { fuzzyMatch } from '@core/util/fuzzy';
import LoadingSpinner from '@icon/regular/spinner.svg?component-solid';
import XIcon from '@icon/regular/x.svg?component-solid';
import { ContextMenu } from '@kobalte/core/context-menu';
import { DropdownMenu as KDropdownMenu } from '@kobalte/core/dropdown-menu';
import { supportedExtensions } from '@lexical-core/utils';
import {
  createChannelsQuery,
  createDssInfiniteQuery,
  createFilterComposer,
  createProjectFilterFn,
  createSort,
  createUnifiedInfiniteList,
  createUnifiedSearchInfiniteQuery,
  type DocumentEntity,
  Entity,
  type EntityClickHandler,
  type EntityData,
  type EntityFilter,
  type ExpandedEntityType,
  importantFilterFn,
  isTaskEntity,
  notDoneFilterFn,
  type SortOption,
  sortByCreatedAt,
  sortByFrecencyScore,
  sortByUpdatedAt,
  sortByViewedAt,
  unreadFilterFn,
  type WithNotification,
  type WithSearch,
} from '@macro-entity';
import {
  isChannelMention,
  isChannelMessageReply,
  isChannelMessageSend,
  tryToTypedNotification,
  type UnifiedNotification,
  useNotificationsForEntity,
} from '@notifications';
import type { PaginatedSearchArgs } from '@service-search/client';
import type {
  ChannelFilters,
  ChatFilters,
  DocumentFilters,
  EmailFilters,
  ProjectFilters,
  UnifiedSearchIndex,
  UnifiedSearchRequestFilters,
} from '@service-search/generated/models';
import type {
  GetItemsSoupParams,
  PostSoupRequest,
} from '@service-storage/generated/schemas';
import stringify from 'json-stable-stringify';
import {
  type Accessor,
  batch,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSelector,
  createSignal,
  mergeProps,
  on,
  onCleanup,
  onMount,
  type Setter,
  Show,
  type Signal,
} from 'solid-js';
import {
  createStore,
  produce,
  type SetStoreFunction,
  unwrap,
} from 'solid-js/store';
import { EntityWithEverything } from '../../macro-entity/src/components/EntityWithEverything';
import {
  resetCommandCategoryIndex,
  searchCategories,
  setCommandCategoryIndex,
  setKonsoleContextInformation,
} from './command/KonsoleItem';
import {
  resetKonsoleMode,
  setKonsoleMode,
  toggleKonsoleVisibility,
} from './command/state';
import { EntityActionsMenuItems } from './EntityActionsMenuItems';
import { EntityModal } from './EntityModal/EntityModal';
import { EntitySelectionToolbarModal } from './EntitySelectionToolbarModal';
import { signalFilter } from './soupFilters';
import { SplitHeaderLeft } from './split-layout/components/SplitHeader';
import { useSplitLayout } from './split-layout/layout';
import { useSplitPanelOrThrow } from './split-layout/layoutUtils';
import {
  applyClientFilters,
  type DisplayOptions,
  type DocumentTypeFilter,
  type FilterOptions,
  KNOWN_FILE_TYPES,
  type SortOptions,
  type SystemSortOption,
  VIEWCONFIG_BASE,
  VIEWCONFIG_DEFAULTS_IDS_ENUM,
  type ViewData,
} from './ViewConfig';

const SEARCH_SERVICE_DEBOUNCE_MS = 200;
const LOCAL_FUZZY_SEARCH_DEBOUNCE_MS = 20;

const sortOptions = [
  {
    value: 'viewed_at',
    label: 'Viewed',
    sortFn: sortByViewedAt,
  },
  {
    value: 'updated_at',
    label: 'Updated',
    sortFn: sortByUpdatedAt,
  },
  {
    value: 'created_at',
    label: 'Created',
    sortFn: sortByCreatedAt,
  },
  {
    value: 'frecency',
    label: 'Frecency',
    sortFn: sortByFrecencyScore,
  },
] satisfies SortOption<EntityData, SystemSortOption>[];

export type UnifiedListViewProps = {
  defaultFilterOptions?: Partial<FilterOptions>;
  defaultSortOptions?: Partial<SortOptions>;
  defaultDisplayOptions?: Partial<DisplayOptions>;
  hideToolbar?: true;
};

export function UnifiedListView(props: UnifiedListViewProps) {
  const [contextAndModalState, setContextAndModalState] = createStore<{
    modalOpen: boolean;
    modalView: 'rename' | 'moveToProject';
    contextMenuOpen: boolean;
    selectedEntity: WithNotification<EntityData> | undefined;
    prevSelectedEntity: WithNotification<EntityData> | undefined;
  }>({
    modalOpen: false,
    modalView: 'rename',
    contextMenuOpen: false,
    selectedEntity: undefined,
    prevSelectedEntity: undefined,
  });

  const [localEntityListRef, setLocalEntityListRef] = createSignal<
    HTMLDivElement | undefined
  >();

  const defaultFilterOptions = mergeProps(
    VIEWCONFIG_BASE.filters,
    props.defaultFilterOptions
  );
  const defaultSortOptions = mergeProps(
    VIEWCONFIG_BASE.sort,
    props.defaultSortOptions
  );
  const defaultDisplayOptions = mergeProps(
    VIEWCONFIG_BASE.display,
    props.defaultDisplayOptions
  );

  const splitContext = useSplitPanelOrThrow();
  const { isPanelActive, unifiedListContext, panelRef, previewState } =
    splitContext;
  const [preview, setPreview] = previewState;
  const {
    viewsDataStore: viewsData,
    setViewDataStore,
    selectedView,
    importantModeSignal: [importantMode, setImportantMode],
    searchTextSignal: [rawSearchText, _setRawSearchText],
    virtualizerHandleSignal: [virtualizerHandle, setVirtualizerHandle],
    entityListRefSignal: [, setEntityListRef],
    entitiesSignal: [entities_, setEntities],
    emailViewSignal: [emailView],
  } = unifiedListContext;
  const view = createMemo(() => viewsData[selectedView()]);
  const selectedEntity = createMemo(() => view()?.selectedEntity);

  const setSelectedEntity = (entity: EntityData | undefined) => {
    setViewDataStore(
      selectedView(),
      produce((state) => {
        if (!state) return;
        state.selectedEntity = entity;
      })
    );
  };

  const entityListResetScroll = () => {
    setSelectedEntity(entities_()?.at(0));
    virtualizerHandle()?.scrollTo(0);
  };

  const searchText = createMemo(() => rawSearchText().trim());

  createEffect(
    on(
      [localEntityListRef, () => entities_()?.at(0), searchText],
      ([localEntityListRef, firstEntity]) => {
        if (!localEntityListRef) return;
        setEntityListRef(localEntityListRef);

        if (view()?.hasUserInteractedEntity) {
          const selectedEntityId = selectedEntity()?.id;
          if (selectedEntityId) {
            if (localEntityListRef?.isConnected) {
              // focusing non-first entity causes issue where 100ms later, that focused entity loses focus and document.body is focused
              // forcing refocus on that entity works for now
              // read TODO inside function for more info
              tryFocusEntity(selectedEntityId, {
                forceRefocusOnce: true,
              });
            }
          }
          return;
        }

        if (!firstEntity) return;

        setSelectedEntity(firstEntity);

        tryFocusEntity(firstEntity.id);

        function tryFocusEntity(
          entityId: string,
          { forceRefocusOnce }: { forceRefocusOnce: boolean } = {
            forceRefocusOnce: false,
          }
        ) {
          setTimeout(() => {
            const dontFocus = () => {
              if (!localEntityListRef) return true;
              // don't steal focus outside of entityList
              if (
                !(
                  document.activeElement === document.body ||
                  document.activeElement === panelRef() ||
                  localEntityListRef.contains(document.activeElement)
                )
              ) {
                return true;
              }
              return false;
            };

            if (dontFocus()) return;

            const focusElement = localEntityListRef?.querySelector(
              `[data-entity-id="${entityId}"]`
            );

            if (focusElement instanceof HTMLElement) {
              focusElement.focus({ preventScroll: true });

              // TODO: figure out what's causing document.body to be focused
              // 100ms later or so, document.body is focused, despite focueElement still connected, and not shuffled
              // without this, createMenu on close doesn't refocus on entity
              if (forceRefocusOnce) {
                focusElement.addEventListener(
                  'blur',
                  () => {
                    if (dontFocus()) return;

                    focusElement.focus({ preventScroll: true });
                  },
                  { once: true }
                );
              }
            }
          });
        }
      }
    )
  );

  const notificationFilter = createMemo(
    () =>
      view()?.filters?.notificationFilter ??
      defaultFilterOptions.notificationFilter
  );
  const setNotificationFilter = (
    notificationFilter: FilterOptions['notificationFilter']
  ) => {
    setViewDataStore(
      selectedView(),
      'filters',
      'notificationFilter',
      notificationFilter
    );
  };

  const importantFilter = createMemo(
    () =>
      view()?.filters?.importantFilter ?? defaultFilterOptions.importantFilter
  );
  const _setImportantFilter = (importantFilter: boolean) => {
    setViewDataStore(
      selectedView(),
      'filters',
      'importantFilter',
      importantFilter
    );
  };

  const entityTypeFilter = createMemo(
    () => view()?.filters?.typeFilter ?? defaultFilterOptions.typeFilter
  );
  const setEntityTypeFilter: SetStoreFunction<
    ViewData['filters']['typeFilter']
  > = (...args: any[]) => {
    // @ts-ignore narrowing set store function is annoying due to function overloading
    setViewDataStore(selectedView(), 'filters', 'typeFilter', ...args);
    entityListResetScroll();
  };

  const fileTypeFilter = createMemo(
    () =>
      view()?.filters?.documentTypeFilter ??
      defaultFilterOptions.documentTypeFilter
  );
  const setFileTypeFilter: SetStoreFunction<
    ViewData['filters']['documentTypeFilter']
  > = (...args: any[]) => {
    setViewDataStore(
      selectedView(),
      'filters',
      'documentTypeFilter',
      // @ts-ignore narrowing set store function is annoying due to function overloading
      ...args
    );
  };

  const projectFilter = createMemo(
    () => view()?.filters?.projectFilter ?? defaultFilterOptions.projectFilter
  );

  const { all: _emailRecipientOptions } = useCombinedRecipients(['user']);
  const fromFilter = createMemo(() => view()?.filters.fromFilter);
  const hasFromFilter = createMemo(() => fromFilter() !== undefined);
  const shouldFilterEmails = createMemo(() => {
    if (!hasFromFilter()) return false;
    const types = entityTypeFilter();
    return types.length === 0 || types.includes('email');
  });
  const shouldFilterOwnedEntities = createMemo(() => {
    if (!hasFromFilter()) return false;
    const types = entityTypeFilter();
    return types.length === 0 || types.some((t) => t !== 'email');
  });
  const _showFromFilter = createMemo(
    () => shouldFilterEmails() || shouldFilterOwnedEntities()
  );
  const fromFilterUsers = createMemo(() => fromFilter() ?? []);
  const _setFromFilterUsers: SetStoreFunction<
    ViewData['filters']['fromFilter']
  > = (...args: any[]) => {
    // @ts-ignore narrowing set store function is annoying due to function overloading
    setViewDataStore(selectedView(), 'filters', 'fromFilter', ...args);
  };

  const getSystemSortOption = (
    sort: SortOptions | undefined
  ): SystemSortOption => {
    if (sort?.type === 'systemSortOption') {
      return sort.sortBy;
    }
    // Default fallback - use defaultSortOptions if it's a system sort
    if (
      defaultSortOptions.type === 'systemSortOption' &&
      defaultSortOptions.sortBy
    ) {
      return defaultSortOptions.sortBy;
    }
    return 'updated_at';
  };

  const sortType = createMemo(() => getSystemSortOption(view()?.sort));
  const setSortType = (sortBy: SystemSortOption) => {
    (setViewDataStore as any)(selectedView(), 'sort', 'sortBy', sortBy);
  };

  const propertyId = createMemo(() => {
    const sort = view()?.sort;
    return sort?.type === 'property' ? sort.propertyId : null;
  });
  const setPropertyId = (id: string | null) => {
    if (id === null) {
      // Clear property sort, revert to system
      batch(() => {
        (setViewDataStore as any)(
          selectedView(),
          'sort',
          'type',
          'systemSortOption'
        );
        (setViewDataStore as any)(selectedView(), 'sort', 'propertyId', null);
      });
    } else {
      // Set property sort
      batch(() => {
        (setViewDataStore as any)(selectedView(), 'sort', 'type', 'property');
        (setViewDataStore as any)(selectedView(), 'sort', 'propertyId', id);
        // Clear sortBy if switching to property
        (setViewDataStore as any)(selectedView(), 'sort', 'sortBy', null);
      });
    }
  };

  const sortOrder = createMemo(
    () => view()?.sort?.sortOrder ?? defaultSortOptions.sortOrder
  );
  const setSortOrder = (order: 'ascending' | 'descending') => {
    setViewDataStore(selectedView(), 'sort', 'sortOrder', order);
  };

  const showUnrollNotifications = createMemo(
    () =>
      view()?.display?.unrollNotifications ??
      defaultDisplayOptions.unrollNotifications
  );
  const _setShowUnrollNotifications = (
    showUnrollNotifications: DisplayOptions['unrollNotifications']
  ) => {
    setViewDataStore(
      selectedView(),
      'display',
      'unrollNotifications',
      showUnrollNotifications
    );
  };

  const showUnreadIndicator = createMemo(
    () =>
      view()?.display?.showUnreadIndicator ??
      defaultDisplayOptions.showUnreadIndicator
  );
  const _setShowUnreadIndicator = (
    showUnreadIndicator: DisplayOptions['showUnreadIndicator']
  ) => {
    setViewDataStore(
      selectedView(),
      'display',
      'showUnreadIndicator',
      showUnreadIndicator
    );
  };

  const _displayProperties = createMemo(
    () =>
      view()?.display?.displayProperties ??
      defaultDisplayOptions.displayProperties
  );
  const _setDisplayProperties = (
    properties: DisplayOptions['displayProperties']
  ) => {
    setViewDataStore(
      selectedView(),
      'display',
      'displayProperties',
      properties
    );
  };

  // Suggested properties reactive to filter type
  const _suggestedProperties = createMemo(() => {
    const types = entityTypeFilter();
    return getSuggestedProperties(types);
  });

  const debouncedSearchForLocal = debouncedDependent(
    searchText,
    LOCAL_FUZZY_SEARCH_DEBOUNCE_MS
  );
  const debouncedSearchForService = debouncedDependent(
    searchText,
    SEARCH_SERVICE_DEBOUNCE_MS
  );

  const [isSearchLoading, setIsSearchLoading] = createSignal(false);

  const currentViewConfigBase = createMemo(() => {
    const viewKey = selectedView();
    const viewData = viewsData[viewKey];
    if (!viewData) return null;

    // Access store properties directly (not through view() memo) for reactivity
    const sort = viewsData[viewKey]?.sort as any;
    const sortType = sort?.type ?? null;
    const sortBy = sort?.sortBy ?? null;
    const propertyId = sort?.propertyId ?? null;
    const sortOrder = sort?.sortOrder ?? null;

    return {
      display: viewsData[viewKey]?.display,
      filters: viewsData[viewKey]?.filters,
      sort: {
        type: sortType,
        sortBy,
        propertyId,
        sortOrder,
      },
    };
  });
  const stringifiedCurrentViewConfigBase = createMemo(() => {
    if (!view()) return null;
    return stringify(currentViewConfigBase());
  });

  const { setFilters: setOptionalFilters, filterFn: optionalFilter } =
    createFilterComposer();
  const { setFilters: setRequiredFilters, filterFn: requiredFilter } =
    createFilterComposer();

  const _toggleFileTypeFilter = (fileType: DocumentTypeFilter) => {
    batch(() => {
      if (!entityTypeFilter().includes('document'))
        setEntityTypeFilter((prev) => [...prev, 'document']);

      setFileTypeFilter((prev) =>
        prev.includes(fileType)
          ? prev.filter((t) => t !== fileType)
          : [...prev, fileType]
      );
    });
    entityListResetScroll();
  };

  const nameFuzzySearchFilter = createMemo(() =>
    rawSearchText()
      ? (items: WithNotification<EntityData>[]) => {
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
            } as WithNotification<WithSearch<EntityData>>;
          });
        }
      : undefined
  );

  const fileTypeCompatibilityFilter = createMemo(() => {
    const filterByFileType = fileTypeFilter();

    let filterFn: EntityFilter<EntityData> | undefined;
    if (filterByFileType.length === 1 && filterByFileType[0] === 'unknown') {
      filterFn = (entity) => {
        if (entity.type !== 'document') return true;

        const entityFileType = entity.fileType;
        if (!entityFileType) return true;

        return KNOWN_FILE_TYPES.every(
          (fileType) => !blockAcceptsFileExtension(fileType, entityFileType)
        );
      };
    } else if (filterByFileType.length > 0) {
      filterFn = (entity) => {
        if (entity.type !== 'document') return true;

        const entityFileType = entity.fileType;
        if (
          filterByFileType.includes('unknown') &&
          (!entityFileType ||
            KNOWN_FILE_TYPES.every(
              (fileType) => !blockAcceptsFileExtension(fileType, entityFileType)
            ))
        )
          return true;

        return (
          !!entityFileType &&
          filterByFileType.some((fileType) =>
            blockAcceptsFileExtension(fileType, entityFileType)
          )
        );
      };
    }
    return filterFn;
  });

  const ownerFilter = createMemo<EntityFilter<EntityData> | undefined>(() => {
    if (!shouldFilterOwnedEntities()) return undefined;
    const selectedFromUsers = fromFilterUsers();
    if (selectedFromUsers.length === 0) return undefined;

    return (entity) => {
      if (entity.type === 'email') return true;

      const ownerId = entity.ownerId;
      if (!ownerId) return false;

      const match = selectedFromUsers.some((user) => {
        return user.id === ownerId;
      });
      return match;
    };
  });

  // NOTE: these filters are required because the backend doesn't support these filters yet
  createEffect(() => {
    const filterFns: EntityFilter<EntityData>[] = [];

    // Split-scoped Important mode maps to legacy Signal behavior:
    // - always filter to not-done
    // - apply the Signal email heuristic
    if (importantMode()) {
      filterFns.push(notDoneFilterFn);
      filterFns.push((entity: WithNotification<EntityData>) => {
        if (entity.type !== 'email') return true;
        return signalFilter.predicate(entity, {
          soupContext: unifiedListContext,
        });
      });
    } else if (importantFilter()) {
      filterFns.push(importantFilterFn);
    }

    if (notificationFilter() === 'unread') filterFns.push(unreadFilterFn);

    if (notificationFilter() === 'notDone') filterFns.push(notDoneFilterFn);

    const clientFilterFn = (entity: WithNotification<EntityData>) => {
      const filtered = applyClientFilters([entity], selectedView(), {
        soupContext: unifiedListContext,
      });
      return filtered.length > 0;
    };
    filterFns.push(clientFilterFn);

    setRequiredFilters(filterFns);
  });

  createEffect(() => {
    const filterFns: EntityFilter<EntityData>[] = [];

    const projectFilter_ = projectFilter();
    if (projectFilter_) {
      filterFns.push(createProjectFilterFn(projectFilter_));
    }

    if (entityTypeFilter().length > 0) {
      filterFns.push((entity) => {
        // special case the tasks, entity type will still be document
        if (isTaskEntity(entity)) {
          return entityTypeFilter().includes('task');
        }
        return entityTypeFilter().includes(entity.type);
      });
    }

    const fileTypeCompatibilityFilter_ = fileTypeCompatibilityFilter();
    if (fileTypeCompatibilityFilter_)
      filterFns.push(fileTypeCompatibilityFilter_);

    // NOTE: email from filters handled directly in search service
    const ownerFilter_ = ownerFilter();
    if (ownerFilter_) filterFns.push(ownerFilter_);

    setOptionalFilters(filterFns);
  });

  const unifiedSearchIncludeArray = createMemo<UnifiedSearchIndex[]>(() => {
    let types = entityTypeFilter();
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
    return includeArray;
  });

  const unifiedSearchFilters = createMemo<UnifiedSearchRequestFilters>(() => {
    let documentFilters: DocumentFilters | null = null;
    if (fileTypeFilter().length > 0) {
      const fileTypes = fileTypeFilter().flatMap((fileType) => {
        // not ideal but it works for most cases
        if (fileType === 'code') return supportedExtensions;
        return [fileType];
      });
      documentFilters = {
        file_types: fileTypes,
      };
    }

    let emailFilters: EmailFilters | null = null;
    if (shouldFilterEmails()) {
      const users = fromFilterUsers();
      if (users.length > 0) {
        const senderEmails = users.map((user) => user.data.email);
        emailFilters = {
          senders: senderEmails,
        };
      }
    }

    let channelFilters: ChannelFilters | null = null;
    let chatFilters: ChatFilters | null = null;
    let projectFilters: ProjectFilters | null = null;
    if (shouldFilterOwnedEntities()) {
      const users = fromFilterUsers();
      if (users.length > 0) {
        const ownerIds = users.map((user) => user.id);
        channelFilters = {
          sender_ids: ownerIds,
        };
        chatFilters = {
          owners: ownerIds,
        };
        projectFilters = {
          owners: ownerIds,
        };
      }
    }

    const projectId = projectFilter();
    if (projectId) {
      documentFilters = {
        ...(documentFilters ?? {}),
        project_ids: [projectId],
      };
      chatFilters = {
        ...(chatFilters ?? {}),
        project_ids: [projectId],
      };
      projectFilters = {
        ...(projectFilters ?? {}),
        project_ids: [projectId],
      };
    }

    const filters = {
      document: documentFilters,
      chat: chatFilters,
      channel: channelFilters,
      email: emailFilters,
      project: projectFilters,
    };

    return filters;
  });

  const emailActive = useEmailLinksStatus();

  const validSearchTerms = createMemo(() => {
    return debouncedSearchForService().length >= 3;
  });
  const isSearchActive = createMemo(() => {
    return validSearchTerms();
  });

  const dssQueryParams = createMemo(
    (): GetItemsSoupParams => ({
      limit: props.defaultDisplayOptions?.limit ?? 100,
      sort_method: sortType(),
    })
  );
  const GARBAGE_UUID = '00000000-0000-0000-0000-000000000000';
  const dssQueryRequestBody = createMemo(
    (): PostSoupRequest => ({
      channel_filters: {
        channel_ids: [GARBAGE_UUID],
      },
      document_filters: {
        document_ids:
          entityTypeFilter().includes('document') ||
          entityTypeFilter().includes('task') ||
          entityTypeFilter().length === 0
            ? []
            : [GARBAGE_UUID],
        project_ids: view().viewType === 'project' ? [view().id] : [],
      },
      chat_filters: {
        chat_ids:
          entityTypeFilter().includes('chat') || entityTypeFilter().length === 0
            ? []
            : [GARBAGE_UUID],
        project_ids: view().viewType === 'project' ? [view().id] : [],
      },
      email_filters: {
        recipients:
          emailActive() &&
          !isSearchActive() &&
          view().viewType !== 'project' &&
          (entityTypeFilter().includes('email') ||
            entityTypeFilter().length === 0)
            ? []
            : [GARBAGE_UUID],
      },
      project_filters: {
        project_ids:
          view().viewType === 'project'
            ? [view().id]
            : entityTypeFilter().includes('project') ||
                entityTypeFilter().length === 0
              ? []
              : [GARBAGE_UUID],
      },
      limit: props.defaultDisplayOptions?.limit ?? 100,
      emailView: importantFilter()
        ? 'important'
        : view().id === VIEWCONFIG_DEFAULTS_IDS_ENUM.all
          ? 'all'
          : view().id === VIEWCONFIG_DEFAULTS_IDS_ENUM.email
            ? emailView()
            : undefined,

      sort_method: sortType(),
    })
  );
  const searchUnifiedNameContentQueryParams = createMemo(
    (): PaginatedSearchArgs => ({
      params: {
        page: 0,
        page_size: 100,
      },
      request: {
        search_on: 'name_content',
        match_type: 'partial',
        terms:
          debouncedSearchForService().length > 0
            ? [debouncedSearchForService()]
            : undefined,
        filters: unifiedSearchFilters(),
        include: unifiedSearchIncludeArray(),
      },
    })
  );

  const disableSearchService = createMemo(() => {
    return !isSearchActive();
  });

  const disableDssInfiniteQuery = createMemo(() => {
    const typeFilter = entityTypeFilter();
    if (typeFilter.length === 0) return false;

    function onlyHas<T>(arr: readonly T[], value: T): boolean {
      return arr.length === 1 && arr[0] === value;
    }

    if (onlyHas(typeFilter, 'channel')) return true;
    if (isSearchActive() && onlyHas(typeFilter, 'email')) return true;
    return false;
  });

  const disableChannelsQuery = createMemo(() => {
    const typeFilter = entityTypeFilter();
    if (typeFilter.length > 0 && !typeFilter.includes('channel')) return true;
    return false;
  });

  // TODO: fix email source
  // const emailSource = useGlobalEmailSource();
  // createEffect(() => emailSource.setQueryParams(emailQueryParams()));

  const notificationSource = useGlobalNotificationSource();
  const markEntityAsDone = (entity: EntityData) => {
    const actions = unifiedListContext.actionRegistry;
    if (actions.isActionEnabled('mark_as_done', entity)) {
      actions.execute('mark_as_done', entity);
      return true;
    }
    return false;
  };

  const { replaceOrInsertSplit, insertSplit } = useSplitLayout();

  const blockOrchestrator = useGlobalBlockOrchestrator();
  const gotoChannelNotification = async (notification: UnifiedNotification) => {
    if (
      !isChannelMention(notification) &&
      !isChannelMessageReply(notification) &&
      !isChannelMessageSend(notification)
    )
      return;

    const message_id = notification.notificationMetadata.messageId;
    let thread_id: string | null | undefined;

    const blockHandle = await blockOrchestrator.getBlockHandle(
      notification.entity_id,
      'channel'
    );
    if (!blockHandle) return;

    if (!isChannelMessageSend(notification))
      thread_id = notification.notificationMetadata.threadId;

    notificationSource.markAsRead(notification);

    return blockHandle?.goToLocationFromParams({
      [CHANNEL_PARAMS.message]: message_id,
      [CHANNEL_PARAMS.thread]: thread_id,
    });
  };

  const { sortFn: entitySort } = createSort({
    sortOptions,
    defaultSortOption: getSystemSortOption(defaultSortOptions as SortOptions),
    sortTypeSignal: [sortType, setSortType] as Signal<SystemSortOption>,
    propertyIdSignal: [propertyId, setPropertyId] as Signal<string | null>,
    sortOrderSignal: [sortOrder, setSortOrder] as Signal<
      'ascending' | 'descending'
    >,
    disabled: isSearchActive,
  });

  const {
    dispose: disposeUnifiedListQueries,
    UnifiedListComponent,
    isLoading,
  } = createRoot((dispose) => {
    const channelsQuery = createChannelsQuery({
      disabled: disableChannelsQuery,
    });
    const dssInfiniteQuery = createDssInfiniteQuery(
      dssQueryParams,
      dssQueryRequestBody,
      {
        disabled: disableDssInfiniteQuery,
      }
    );
    const searchNameContentInfiniteQuery = createUnifiedSearchInfiniteQuery(
      searchUnifiedNameContentQueryParams,
      { disabled: disableSearchService }
    );
    const notificationSource = useGlobalNotificationSource();

    const entityMapper = (entity: EntityData) => {
      return {
        ...unwrap(entity),
        notifications: useNotificationsForEntity(notificationSource, entity),
      };
    };

    // We want to be to be able to search over locally cached emails without actually
    // fetching more data when we have a invalid search term (i.e. one or two chars).
    // If we're using search service for a valid term, we can safely fetch more data
    // from dss for fuzzy name search since we won't be searching over emails (too big).
    const disableFetchMore = createMemo(() => {
      const searchAllEmails =
        (dssQueryRequestBody().email_filters?.recipients ?? []).length === 0;
      return searchText().length > 0 && searchAllEmails;
    });

    const { UnifiedListComponent, entities, isLoading } =
      createUnifiedInfiniteList<
        WithNotification<WithSearch<EntityData> | EntityData>
      >({
        id: `${selectedView()}-${splitContext.handle.id}`,
        entityInfiniteQueries: [
          {
            query: dssInfiniteQuery,
            operations: { filter: true, search: true },
          },
          {
            query: searchNameContentInfiniteQuery,
            operations: { filter: true, search: false },
          },
        ],
        entityMapper,
        entityQueries: [
          { query: channelsQuery, operations: { filter: true, search: true } },
        ],
        requiredFilter,
        optionalFilter,
        entitySort,
        searchFilter: nameFuzzySearchFilter,
        isSearchActive,
        disableFetchMore,
      });

    createEffect(() => {
      setEntities(entities());
    });

    return { dispose, isLoading, UnifiedListComponent };
  });

  createEffect(() => {
    const loading = isLoading();
    setIsSearchLoading(loading);
  });

  onCleanup(() => {
    createRoot((dispose) => {
      createEffect(() => {
        // don't dispose on blocks, such as email block when marking as done, in order to update entity navigation indicator
        if (
          splitContext.panelRef()?.isConnected &&
          splitContext.handle.content().id !== 'unified-list'
        ) {
          return;
        }

        disposeUnifiedListQueries();
        dispose();
      });
    });
  });

  const documentEntityClickHandler: EntityClickHandler<
    DocumentEntity | WithSearch<DocumentEntity>
  > = async (entity, event, location) => {
    const { id, fileType, subType } = entity;
    const blockName = fileTypeToBlockName(subType ?? fileType);
    const handle = event.altKey
      ? insertSplit({ type: blockName, id })
      : replaceOrInsertSplit({ type: blockName, id });

    handle?.activate();

    if (!location) return;

    const blockHandle = await blockOrchestrator.getBlockHandle(id);
    switch (location.type) {
      case 'md':
        await blockHandle?.goToLocationFromParams({
          [MD_PARAMS.nodeId]: location.nodeId,
        });
        break;
      case 'pdf':
        await blockHandle?.goToLocationFromParams({
          [PDF_PARAMS.searchPage]: location.searchPage.toString(),
          [PDF_PARAMS.searchRawQuery]: location.searchRawQuery,
          [PDF_PARAMS.searchHighlightTerms]: JSON.stringify(
            location.highlightTerms
          ),
          [PDF_PARAMS.searchSnippet]: location.searchSnippet,
        });
        break;
    }
  };

  const entityClickHandler: EntityClickHandler<EntityData> = async (
    entity,
    event,
    location,
    options
  ) => {
    if (preview() && !options?.ignorePreview) {
      setSelectedEntity(entity);

      return;
    }

    if (entity.type === 'document')
      return documentEntityClickHandler(entity, event, location);

    const params =
      entity.type === 'channel' && location?.type === 'channel'
        ? ({
            target: {
              threadId: location.threadId,
              messageId: location.messageId,
            },
          } as BlockChannelProps)
        : undefined;

    const handle = event.altKey
      ? insertSplit({ type: entity.type, id: entity.id, params })
      : replaceOrInsertSplit({ type: entity.type, id: entity.id, params });

    handle?.activate();

    if (!location) return;

    switch (location.type) {
      case 'channel': {
        // NOTE: this is handled by the channel block params but this can be used to re-flash an open channel
        const blockHandle = await blockOrchestrator.getBlockHandle(entity.id);
        await blockHandle?.goToLocationFromParams({
          [CHANNEL_PARAMS.thread]: location.threadId,
          [CHANNEL_PARAMS.message]: location.messageId,
        });
        break;
      }
      case 'email': {
        const blockHandle = await blockOrchestrator.getBlockHandle(entity.id);
        await blockHandle?.goToLocationFromParams({
          [EMAIL_PARAMS.messageId]: location.messageId,
        });
        break;
      }
    }
  };

  const focusedSelector = createSelector(() => selectedEntity()?.id);
  const multiSelectSelector = createSelector(
    () => view()?.multiSelectEntities,
    (a: string, b: EntityData[]) => b.find((e) => e.id === a) !== undefined
  );

  type SelectionRect = {
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
  };

  const [unifiedListRootRef, setUnifiedListRootRef] =
    createSignal<HTMLDivElement | null>(null);
  const [selectionRect, setSelectionRect] = createSignal<SelectionRect>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    visible: false,
  });
  const [animateSelection, setAnimateSelection] = createSignal(true);
  let scrollEndTimeout: number | undefined;
  let sortMenuTriggerEl: HTMLButtonElement | undefined;
  const [sortMenuWidth, setSortMenuWidth] = createSignal(0);
  const [sortMenuOpen, setSortMenuOpen] = createSignal(false);

  // When Important mode is enabled, temporarily override sort/display per-view to match legacy Signal defaults.
  const overriddenViews = new Map<
    string,
    { sort: SortOptions; display: DisplayOptions }
  >();

  const cloneDisplay = (d: DisplayOptions): DisplayOptions => {
    return {
      ...(d as any),
      displayProperties: [...(d.displayProperties ?? [])],
    } as DisplayOptions;
  };

  const applyImportantOverridesForView = (viewId: string) => {
    const v = viewsData[viewId];
    if (!v) return;

    if (!overriddenViews.has(viewId)) {
      overriddenViews.set(viewId, {
        sort: { ...(unwrap(v.sort) as any) } as SortOptions,
        display: cloneDisplay(unwrap(v.display) as DisplayOptions),
      });
    }

    // Match legacy Signal defaults
    (setViewDataStore as any)(viewId, 'sort', {
      type: 'systemSortOption',
      sortBy: 'updated_at',
      sortOrder: 'ascending',
    } satisfies SortOptions);
    setViewDataStore(viewId, 'display', 'unrollNotifications', true);
    setViewDataStore(viewId, 'display', 'showUnreadIndicator', true);
  };

  const restoreImportantOverrides = () => {
    for (const [viewId, prev] of overriddenViews.entries()) {
      (setViewDataStore as any)(viewId, 'sort', prev.sort);
      (setViewDataStore as any)(viewId, 'display', prev.display);
    }
    overriddenViews.clear();
  };

  createEffect(() => {
    if (!importantMode()) return;
    applyImportantOverridesForView(selectedView());
  });

  createEffect((prevEnabled: boolean) => {
    const enabled = importantMode();
    if (prevEnabled && !enabled) {
      restoreImportantOverrides();
    }
    return enabled;
  }, importantMode());

  const activeEntityId = createMemo(() => {
    const modalOrContextSelectedId = contextAndModalState.selectedEntity?.id;
    return modalOrContextSelectedId ?? selectedEntity()?.id;
  });

  const updateSelectionRect = (opts?: { animate?: boolean }) => {
    const root = unifiedListRootRef();
    const listEl = localEntityListRef();
    const id = activeEntityId();

    if (opts?.animate !== undefined) setAnimateSelection(opts.animate);

    if (!root || !listEl || !id) {
      setSelectionRect((prev) => ({ ...prev, visible: false }));
      return;
    }

    const item = listEl.querySelector(
      `[data-entity-id="${CSS.escape(id)}"]`
    ) as HTMLElement | null;

    const wrapper = (item?.closest('.everything-entity') ??
      item) as HTMLElement | null;

    if (!wrapper) {
      setSelectionRect((prev) => ({ ...prev, visible: false }));
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const rect = wrapper.getBoundingClientRect();

    setSelectionRect({
      x: rect.left - rootRect.left,
      y: rect.top - rootRect.top,
      width: rect.width,
      height: rect.height,
      visible: true,
    });
  };

  // Convert the selection rect from unified-list-local coordinates to split-panel-local coordinates,
  // and expand by 1px so the outline/brackets can paint on top of the split border.
  const selectionRectInSplit = createMemo<SelectionRect>(() => {
    const rect = selectionRect();
    if (!rect.visible) return rect;

    const root = unifiedListRootRef();
    const panel = splitContext.panelRef();
    if (!root || !panel) return { ...rect, visible: false };

    const rootRect = root.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    return {
      x: rootRect.left - panelRect.left + rect.x - 1,
      y: rootRect.top - panelRect.top + rect.y - 1,
      width: rect.width + 2,
      height: rect.height + 2,
      visible: true,
    };
  });

  // Animate the selection highlight when the active entity changes.
  createEffect(
    on(activeEntityId, () => {
      updateSelectionRect({ animate: true });
    })
  );

  // When layout changes (split resize, preview toggle), recompute without animation.
  // Width changes are always layout-driven, so we never want to animate them.
  createEffect(
    on(
      [
        () => splitContext.panelSize.width,
        () => splitContext.panelSize.height,
        preview,
      ],
      () => {
        updateSelectionRect({ animate: false });
      }
    )
  );

  // When the list contents change (e.g. marking done removes items above), the selected entity may
  // move on screen without the selected id changing. Re-measure after the DOM reflows.
  createEffect(
    on([() => entities_()?.length], () => {
      requestAnimationFrame(() => updateSelectionRect({ animate: false }));
    })
  );

  // If refs mount after the active id is already set, ensure we still place the highlight.
  createEffect(
    on([unifiedListRootRef, localEntityListRef], () => {
      updateSelectionRect({ animate: false });
    })
  );

  // Keep the highlight aligned during scrolling/resizing (no animation to avoid lag).
  createEffect(() => {
    const listEl = localEntityListRef();
    if (!listEl) return;

    const onScrollOrResize = () => {
      updateSelectionRect({ animate: false });
      if (scrollEndTimeout) window.clearTimeout(scrollEndTimeout);
      scrollEndTimeout = window.setTimeout(() => {
        setAnimateSelection(true);
      }, 80);
    };

    listEl.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    onCleanup(() => {
      listEl.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      if (scrollEndTimeout) window.clearTimeout(scrollEndTimeout);
    });
  });

  // NOTE: We intentionally removed the "CLEAR / SAVE CHANGES" controls.

  // Set initialConfig when it's not present (on load or after save/refetch)
  createEffect(() => {
    const view_ = view();
    if (!view_) return;

    const initialConfig = view_.initialConfig;
    if (initialConfig) return;

    const stringifiedConfig = stringifiedCurrentViewConfigBase();
    if (stringifiedConfig) {
      setViewDataStore(selectedView(), 'initialConfig', stringifiedConfig);
    }
  });

  let lastClickedEntityId = -1;

  // reset last clicked on view change.
  createEffect(
    on(view, () => {
      lastClickedEntityId = -1;
    })
  );

  // reset last clicked on reset multi-selection.
  createEffect(() => {
    if (
      unifiedListContext.viewsDataStore[selectedView()].multiSelectEntities
        .length === 0
    ) {
      lastClickedEntityId = -1;
    }
  });

  onMount(() => {
    const isViewingList = () => {
      const content = splitContext.handle.content();
      return (
        isPanelActive() &&
        content.type === 'component' &&
        content.id === 'unified-list'
      );
    };

    const { dispose: disposeUnread } = registerHotkey({
      hotkey: ['u'],
      scopeId: splitContext.splitHotkeyScope,
      description: 'Toggle unread',
      condition: isViewingList,
      keyDownHandler: () => {
        const next = notificationFilter() === 'unread' ? 'all' : 'unread';
        setNotificationFilter(next);
        return true;
      },
      displayPriority: 5,
    });

    const { dispose: disposeSort } = registerHotkey({
      hotkey: ['s'],
      scopeId: splitContext.splitHotkeyScope,
      description: 'Open sort',
      condition: () => isViewingList() && !isSearchActive(),
      keyDownHandler: () => {
        const w = sortMenuTriggerEl?.getBoundingClientRect().width ?? 0;
        setSortMenuWidth(Math.max(200, Math.floor(w)));
        setSortMenuOpen(true);
        sortMenuTriggerEl?.focus();
        return true;
      },
      displayPriority: 5,
    });

    const { dispose: disposeImportant } = registerHotkey({
      hotkey: ['i'],
      scopeId: splitContext.splitHotkeyScope,
      description: 'Toggle important',
      condition: isViewingList,
      keyDownHandler: () => {
        setImportantMode((prev) => !prev);
        return true;
      },
      displayPriority: 5,
    });

    onCleanup(() => {
      disposeUnread();
      disposeSort();
      disposeImportant();
    });
  });

  return (
    <>
      <Show when={!props.hideToolbar}>
        <SplitHeaderLeft>
          <UnifiedListFilterControls
            importantMode={importantMode}
            setImportantMode={setImportantMode}
            notificationFilter={notificationFilter}
            setNotificationFilter={setNotificationFilter}
            preview={preview}
            setPreview={setPreview}
            sortMenuOpen={sortMenuOpen}
            setSortMenuOpen={setSortMenuOpen}
            sortMenuWidth={sortMenuWidth}
            setSortMenuWidth={setSortMenuWidth}
            getSortMenuTriggerEl={() => sortMenuTriggerEl}
            setSortMenuTriggerEl={(el) => {
              sortMenuTriggerEl = el;
            }}
            isSearchActive={isSearchActive}
            sortType={sortType}
            setSortType={setSortType}
            entityListResetScroll={entityListResetScroll}
          />
          <SearchBar isLoading={isSearchLoading} />
        </SplitHeaderLeft>
      </Show>
      <ContextMenu
        forceMount={contextAndModalState.contextMenuOpen}
        onOpenChange={(open) => {
          setContextAndModalState((prev) => {
            if (open) {
              return {
                ...prev,
                contextMenuOpen: open,
                prevSelectedEntity: prev.selectedEntity,
              };
            }
            return {
              ...prev,
              contextMenuOpen: open,
              selectedEntity: undefined,
            };
          });
        }}
      >
        <ContextMenu.Trigger
          class="relative size-full unified-list-root"
          ref={setUnifiedListRootRef}
        >
          <ScopedPortal scope="split" show={Boolean(splitContext.panelRef())}>
            <div
              class="pointer-events-none absolute top-0 left-0 z-10"
              classList={{
                // Never animate width (layout-driven); keep transform/height/opacity for nicer row-to-row motion.
                'transition-[transform,height,opacity] duration-150 ease-out':
                  animateSelection(),
                'transition-none': !animateSelection(),
              }}
              style={{
                transform: `translate3d(${selectionRectInSplit().x}px, ${selectionRectInSplit().y}px, 0)`,
                width: `${selectionRectInSplit().width}px`,
                height: `${selectionRectInSplit().height}px`,
                opacity: selectionRectInSplit().visible ? '1' : '0',
              }}
            >
              <div
                class="size-full relative bracket"
                style={{
                  // Equivalent to `bg-accent/2.5` (2.5% accent), but written in CSS so we can
                  // use fractional opacity reliably.
                  'background-color':
                    'color-mix(in srgb, var(--color-accent) 2.5%, transparent)',
                  // Equivalent to `outline-accent/10`, but rendered as an opaque color by blending
                  // against the split panel background color. Use an inset shadow (not outline)
                  // so it doesn't paint outside the split bounds.
                  'box-shadow':
                    'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 15%, var(--color-panel))',
                }}
              >
                <div class="pointer-events-none absolute inset-0 z-0 pattern-accent pattern-diagonal-4 opacity-[0.03]" />
              </div>
            </div>
          </ScopedPortal>
          <UnifiedListComponent
            entityListRef={setLocalEntityListRef}
            virtualizerHandle={setVirtualizerHandle}
            viewId={view()?.id}
            searchText={searchText()}
            hasRefinementsFromBase={false}
          >
            {(innerProps) => {
              const displayDoneButton = () => {
                if (innerProps.entity.type === 'email') {
                  return !innerProps.entity.done;
                }

                return (innerProps.entity.notifications?.().length ?? 0) > 0;
              };
              const timestamp = () => {
                switch (sortType()) {
                  case 'viewed_at':
                    return innerProps.entity.viewedAt;
                  case 'created_at':
                    return innerProps.entity.createdAt;
                  case 'updated_at':
                    return innerProps.entity.updatedAt;
                }
              };
              return (
                <EntityWithEverything
                  disableSelectedStyles
                  onContextMenu={() => {
                    if (isPanelActive() && !preview()) {
                      setSelectedEntity(innerProps.entity);
                    }

                    setContextAndModalState((prev) => {
                      return {
                        ...prev,
                        contextMenuOpen: true,
                        selectedEntity: innerProps.entity,
                      };
                    });
                  }}
                  entity={innerProps.entity}
                  timestamp={timestamp()}
                  onClick={entityClickHandler}
                  onClickRowAction={
                    unifiedListContext.actionRegistry.isActionEnabled(
                      'mark_as_done',
                      innerProps.entity
                    )
                      ? (entity, type) => {
                          if (type === 'done') {
                            markEntityAsDone?.(entity);
                          }
                        }
                      : undefined
                  }
                  onClickNotification={(notifiedEntity) => {
                    const notification = tryToTypedNotification(
                      notifiedEntity.notification
                    );
                    if (!notification) return;

                    if (notifiedEntity.type === 'channel')
                      gotoChannelNotification(notification);
                  }}
                  onMouseOver={() => {
                    if (preview()) return;

                    setViewDataStore(
                      selectedView(),
                      'hasUserInteractedEntity',
                      true
                    );

                    setSelectedEntity(innerProps.entity);
                  }}
                  onMouseLeave={() => {}}
                  onFocusIn={() => {
                    if (preview()) return;

                    setSelectedEntity(innerProps.entity);
                  }}
                  showLeftColumnIndicator={
                    showUnreadIndicator() || importantFilter()
                  }
                  fadeIfRead={showUnreadIndicator()}
                  showUnrollNotifications={showUnrollNotifications()}
                  importantIndicatorActive={importantFilterFn(
                    innerProps.entity
                  )}
                  unreadIndicatorActive={unreadFilterFn(innerProps.entity)}
                  showDoneButton={displayDoneButton()}
                  selected={
                    focusedSelector(innerProps.entity.id) ||
                    contextAndModalState.selectedEntity?.id ===
                      innerProps.entity.id
                  }
                  checked={multiSelectSelector(innerProps.entity.id)}
                  onChecked={(next, shiftKey) => {
                    const toggleSingle = () =>
                      unifiedListContext.setViewDataStore(
                        selectedView(),
                        'multiSelectEntities',
                        (p) => {
                          if (!next) {
                            return p.filter(
                              (e) => e.id !== innerProps.entity.id
                            );
                          }
                          return p.concat(innerProps.entity);
                        }
                      );

                    if (shiftKey) {
                      const entityList = unifiedListContext.entitiesSignal[0]();
                      if (!entityList) return;

                      const selectedEntitySet = new Set(
                        unifiedListContext.viewsDataStore[
                          unifiedListContext.selectedView()
                        ].multiSelectEntities
                      );
                      const newEnititiesForSeleciton: EntityData[] = [];

                      // Try to grab the last clicked item and fall back on
                      // the highest currently selected index.
                      let anchorIndex = lastClickedEntityId;
                      if (anchorIndex === -1) {
                        for (let i = 0; i < entityList.length; i++) {
                          if (selectedEntitySet.has(entityList[i])) {
                            anchorIndex = i;
                          }
                        }
                      }

                      if (anchorIndex === -1) {
                        toggleSingle();
                        lastClickedEntityId = innerProps.index;
                        return;
                      }

                      const targetIndex = innerProps.index;
                      const sign = Math.sign(targetIndex - anchorIndex);
                      if (anchorIndex === targetIndex) {
                        // no_op
                      } else {
                        for (
                          let i = anchorIndex;
                          sign > 0 ? i <= targetIndex : i >= targetIndex;
                          i += sign
                        ) {
                          const entity = entityList[i];
                          if (!selectedEntitySet.has(entity)) {
                            newEnititiesForSeleciton.push(entity);
                          }
                        }
                      }
                      unifiedListContext.setViewDataStore(
                        selectedView(),
                        'multiSelectEntities',
                        (p) => {
                          return p.concat(newEnititiesForSeleciton);
                        }
                      );
                      lastClickedEntityId = innerProps.index;
                    } else {
                      toggleSingle();
                      lastClickedEntityId = innerProps.index;
                    }
                  }}
                />
              );
            }}
          </UnifiedListComponent>
          <EntityModal
            isOpen={() =>
              !!(
                contextAndModalState.modalOpen &&
                contextAndModalState.selectedEntity?.id
              )
            }
            setIsOpen={() =>
              setContextAndModalState((prev) => ({
                ...prev,
                modalOpen: !prev.modalOpen,
              }))
            }
            view={() => contextAndModalState.modalView}
            entity={contextAndModalState.selectedEntity}
          />
          <ContextMenu.Portal>
            <Show when={contextAndModalState.selectedEntity}>
              {(selectedEntity) => (
                <ContextMenuContent mobileFullScreen>
                  <Show when={isTouchDevice && isMobileWidth()}>
                    <Entity
                      entity={selectedEntity()}
                      timestamp={
                        sortType() === 'viewed_at'
                          ? selectedEntity().viewedAt
                          : sortType() === 'created_at'
                            ? selectedEntity().createdAt
                            : undefined
                      }
                    />
                    <MenuSeparator />
                  </Show>
                  <EntityActionsMenuItems
                    entity={selectedEntity()}
                    onSelectAction={() => {}}
                  />
                </ContextMenuContent>
              )}
            </Show>
          </ContextMenu.Portal>
        </ContextMenu.Trigger>
        <Show when={view()?.multiSelectEntities.length}>
          <EntitySelectionToolbarModal
            multiSelectEntities={view()?.multiSelectEntities ?? []}
            onClose={() =>
              unifiedListContext.setViewDataStore(
                selectedView(),
                'multiSelectEntities',
                []
              )
            }
            onAction={() => {
              const multiSelectEntities =
                viewsData[selectedView()].multiSelectEntities;
              const hasSelection = multiSelectEntities.length > 0;
              if (hasSelection) {
                setKonsoleMode('SELECTION_MODIFICATION');
                const selectionIndex =
                  searchCategories.getCategoryIndex('Selection');

                if (selectionIndex === undefined) return false;

                setCommandCategoryIndex(selectionIndex);

                searchCategories.showCategory('Selection');

                setKonsoleContextInformation({
                  selectedEntities: multiSelectEntities.slice(),
                  clearSelection: () => {
                    unifiedListContext.setViewDataStore(
                      selectedView(),
                      'multiSelectEntities',
                      []
                    );
                  },
                });

                toggleKonsoleVisibility();
                return true;
              }
              searchCategories.hideCategory('Selection');
              resetCommandCategoryIndex();
              resetKonsoleMode();
              return false;
            }}
          />
        </Show>{' '}
      </ContextMenu>
    </>
  );
}

const _EntityTypeToggle = (props: {
  type: ExpandedEntityType;
  filter: Accessor<typeof VIEWCONFIG_BASE.filters.typeFilter>;
  setFilter: Setter<typeof VIEWCONFIG_BASE.filters.typeFilter>;
  setFileTypeFilter?: Setter<typeof VIEWCONFIG_BASE.filters.documentTypeFilter>;
}) => {
  const toggleEntityTypeFilter = (type: ExpandedEntityType) => {
    props.setFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };
  return (
    <ToggleButton
      size="SM"
      pressed={props.filter().includes(props.type)}
      onChange={(pressed) =>
        batch(() => {
          if (props.setFileTypeFilter && !pressed) props.setFileTypeFilter([]);

          toggleEntityTypeFilter(props.type);
        })
      }
    >
      <span class="uppercase">
        {props.type === 'project' ? 'folder' : props.type}
      </span>
    </ToggleButton>
  );
};

function UnifiedListFilterControls(props: {
  importantMode: Accessor<boolean>;
  setImportantMode: Setter<boolean>;
  notificationFilter: Accessor<FilterOptions['notificationFilter']>;
  setNotificationFilter: (
    notificationFilter: FilterOptions['notificationFilter']
  ) => void;
  preview: Accessor<boolean>;
  setPreview: Setter<boolean>;
  sortMenuOpen: Accessor<boolean>;
  setSortMenuOpen: Setter<boolean>;
  sortMenuWidth: Accessor<number>;
  setSortMenuWidth: Setter<number>;
  getSortMenuTriggerEl: () => HTMLButtonElement | undefined;
  setSortMenuTriggerEl: (el: HTMLButtonElement) => void;
  isSearchActive: Accessor<boolean>;
  sortType: Accessor<SystemSortOption>;
  setSortType: (sortBy: SystemSortOption) => void;
  entityListResetScroll: () => void;
}) {
  return (
    <>
      <ToggleButton
        size="SM"
        pressed={props.importantMode()}
        onChange={() => props.setImportantMode((prev) => !prev)}
      >
        <span>
          <span class="font-semibold underline underline-offset-2">I</span>
          mpt
        </span>
      </ToggleButton>
      <ToggleButton
        size="SM"
        pressed={props.notificationFilter() === 'unread'}
        onChange={(pressed) => {
          // Binary toggle: unread vs not-unread
          props.setNotificationFilter(pressed ? 'unread' : 'all');
        }}
      >
        <span>
          <span class="font-semibold underline underline-offset-2">U</span>
          nrd
        </span>
      </ToggleButton>
      <Show when={ENABLE_PREVIEW}>
        <ToggleButton
          size="SM"
          pressed={props.preview()}
          onChange={() => {
            // Toggle like Unread: always flip the current state.
            props.setPreview((prev) => !prev);
          }}
        >
          <span>
            <span class="font-semibold underline underline-offset-2">P</span>
            rvw
          </span>
        </ToggleButton>
      </Show>
      <KDropdownMenu
        placement="bottom-start"
        open={props.sortMenuOpen()}
        onOpenChange={(open) => {
          props.setSortMenuOpen(open);
          if (!open) return;
          const w =
            props.getSortMenuTriggerEl()?.getBoundingClientRect().width ?? 0;
          // Give the menu enough room for labels; don't constrain to trigger width.
          props.setSortMenuWidth(Math.max(200, Math.floor(w)));
        }}
      >
        <KDropdownMenu.Trigger
          as="button"
          ref={(el) => {
            props.setSortMenuTriggerEl(el);
          }}
          class="border border-edge-muted min-w-[22px] font-medium font-mono text-center uppercase leading-none whitespace-nowrap text-xs p-1 text-ink-muted hover:opacity-80"
          disabled={props.isSearchActive()}
        >
          <span>
            <span class="font-semibold underline underline-offset-2">S</span>
            ort
          </span>
        </KDropdownMenu.Trigger>
        <KDropdownMenu.Portal>
          <KDropdownMenu.Content
            class={`${MENU_CONTENT_CLASS} py-1`}
            style={{
              width: props.sortMenuWidth()
                ? `${props.sortMenuWidth()}px`
                : undefined,
            }}
          >
            <KDropdownMenu.RadioGroup
              value={props.sortType()}
              onChange={(value) => {
                props.setSortType(value as SystemSortOption);
                props.entityListResetScroll();
              }}
            >
              <MenuItem
                text="Viewed"
                selectorType="radio"
                value="viewed_at"
                groupValue={props.sortType()}
              />
              <MenuItem
                text="Updated"
                selectorType="radio"
                value="updated_at"
                groupValue={props.sortType()}
              />
              <MenuItem
                text="Created"
                selectorType="radio"
                value="created_at"
                groupValue={props.sortType()}
              />
              <MenuItem
                text="Recent"
                selectorType="radio"
                value="frecency"
                groupValue={props.sortType()}
              />
            </KDropdownMenu.RadioGroup>
          </KDropdownMenu.Content>
        </KDropdownMenu.Portal>
      </KDropdownMenu>
    </>
  );
}

function SearchBar(props: { isLoading: Accessor<boolean> }) {
  const splitContext = useSplitPanelOrThrow();
  const {
    viewsDataStore,
    selectedView,
    setSelectedView,
    setViewDataStore,
    virtualizerHandleSignal: [virtualizerHandle],
    entityListRefSignal: [entityListRef],
    navigateThroughList,
    searchTextSignal: [rawSearchText, setRawSearchText],
    emailViewSignal: [emailView, setEmailView],
    importantModeSignal: [, setImportantMode],
  } = splitContext.unifiedListContext;

  let inputRef: HTMLInputElement | undefined;
  let previewHandle: RecipientTypeaheadHandle | undefined;

  const placeholderText = createMemo(() => {
    const shortcutHint = IS_MAC ? '⌘F' : 'Ctrl+F';
    return `Search [${shortcutHint}] everything [/]`;
  });

  const searchText = createMemo<string>(() => rawSearchText());
  const setSearchText = (text: string) => {
    setRawSearchText(text);
  };

  const { all: recipientOptions } = useCombinedRecipients();
  const [searchFocused, setSearchFocused] = createSignal(false);
  const [previewOpen, setPreviewOpen] = createSignal(false);
  const [didNavigateMenu, setDidNavigateMenu] = createSignal(false);
  const [previewSuppressed, setPreviewSuppressed] = createSignal(false);

  createEffect(() => {
    const q = searchText().trim();
    if (q.length === 0) {
      setDidNavigateMenu(false);
      setPreviewSuppressed(false);
    }

    setPreviewOpen(searchFocused() && q.length > 0 && !previewSuppressed());
  });

  const closePreview = () => {
    setPreviewOpen(false);
    setDidNavigateMenu(false);
    setPreviewSuppressed(true);
  };

  const selectionClick = () => {
    const id = viewsDataStore[selectedView()].selectedEntity?.id;
    if (!id) return;
    const el = entityListRef()?.querySelector(`[data-entity-id="${id}"]`);
    if (!(el instanceof HTMLElement)) return;
    el.click();
  };

  const focusNextEntity = () => {
    navigateThroughList({
      axis: 'end',
      mode: 'step',
    });
  };

  const [waitForLoadingEnd, setWaitForLoadingEnd] = createSignal(false);

  // When search text changes, mark that we're waiting for loading to end
  createRenderEffect((prevText: string) => {
    const text = searchText().trim();
    if (text !== prevText) {
      setViewDataStore(selectedView(), 'selectedEntity', undefined);
      setViewDataStore(selectedView(), 'hasUserInteractedEntity', false);
      virtualizerHandle()?.scrollToIndex(0);
      setWaitForLoadingEnd(true);
    }
    return text;
  }, searchText());

  // When we're no longer loading but still waiting, reset the list
  createRenderEffect((prevLoading: boolean) => {
    const loading = props.isLoading();

    if (prevLoading && !loading && waitForLoadingEnd()) {
      // Loading just ended and we were waiting for it
      setWaitForLoadingEnd(false);
      virtualizerHandle()?.scrollToIndex(0);
    }

    return loading;
  }, props.isLoading());

  const focusSearch = () => {
    setTimeout(() => {
      const searchInput = document.getElementById(
        `search-input-${splitContext.handle.id}-${selectedView()}`
      ) as HTMLInputElement;
      searchInput?.focus();
      // Select all text so typing replaces the existing query (Superhuman-style).
      // Do this after focus to ensure the selection sticks across browsers.
      queueMicrotask(() => searchInput?.select());
    }, 0);
  };

  onMount(() => {
    const { dispose: disposeSlash } = registerHotkey({
      hotkey: ['/'],
      scopeId: splitContext.splitHotkeyScope,
      description: 'Search all',
      hotkeyToken: TOKENS.soup.openSearch,
      keyDownHandler: () => {
        setSelectedView(VIEWCONFIG_DEFAULTS_IDS_ENUM.all);
        // Clear all filters - slash means search everything
        const viewId = VIEWCONFIG_DEFAULTS_IDS_ENUM.all;
        setViewDataStore(viewId, 'filters', 'importantFilter', false);
        setViewDataStore(viewId, 'filters', 'notificationFilter', 'all');
        setViewDataStore(viewId, 'filters', 'typeFilter', []);
        setViewDataStore(viewId, 'filters', 'documentTypeFilter', []);
        setImportantMode(false);
        focusSearch();
        return true;
      },
      displayPriority: 5,
    });

    const { dispose: disposeCmd } = registerHotkey({
      hotkey: ['cmd+f'],
      scopeId: splitContext.splitHotkeyScope,
      description: 'Search in current view',
      keyDownHandler: () => {
        focusSearch();
        return true;
      },
      displayPriority: 5,
    });

    onCleanup(() => {
      disposeSlash();
      disposeCmd();
    });
  });

  return (
    <div class="flex items-center gap-2 shrink-0 min-w-0">
      <div class="shrink-0 h-[22px] border border-edge-muted min-w-[140px] w-[20cqw] max-w-[320px] font-medium font-mono text-center uppercase leading-none whitespace-nowrap text-xs p-1 text-ink-muted flex items-center gap-2 bg-panel relative">
        <input
          ref={inputRef}
          id={`search-input-${splitContext.handle.id}-${selectedView()}`}
          placeholder={placeholderText()}
          value={searchText()}
          spellcheck={false}
          autocomplete="off"
          autocapitalize="off"
          onInput={(e) => {
            setPreviewSuppressed(false);
            setDidNavigateMenu(false);
            setSearchText(e.target.value);
          }}
          onFocus={() => {
            setSearchFocused(true);
            // Re-open behavior on focus should be driven by current query.
            // If the user explicitly closed the preview (Enter/Escape), we keep it closed until they type again.
          }}
          onBlur={() => {
            setSearchFocused(false);
            setPreviewSuppressed(false);
            setPreviewOpen(false);
            setDidNavigateMenu(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              if (previewOpen()) {
                closePreview();
                return;
              }
              e.currentTarget.blur();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (previewOpen()) {
                if (!didNavigateMenu()) {
                  closePreview();
                  e.currentTarget.blur();
                  return;
                }
                const highlighted = previewHandle?.getHighlighted();
                const email = highlighted
                  ? getRecipientOptionEmail(highlighted)
                  : undefined;
                if (email) {
                  setSearchText(email);
                }
                closePreview();
                e.currentTarget.blur();
                return;
              }
              e.currentTarget.blur();
              selectionClick();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (previewOpen()) {
                setDidNavigateMenu(true);
                previewHandle?.arrowDown();
                return;
              }
              e.currentTarget.blur();
              focusNextEntity();
            } else if (e.key === 'ArrowUp') {
              if (previewOpen()) {
                e.preventDefault();
                setDidNavigateMenu(true);
                previewHandle?.arrowUp();
              }
            }
          }}
          class="flex-1 h-full min-w-0 min-h-0 p-0 m-0 border-0 outline-none! focus:outline-none ring-0! focus:ring-0 text-xs leading-none text-ink normal-case bg-transparent text-left placeholder:text-ink-muted/70"
        />
        <div class="absolute left-0 top-full w-full">
          <RecipientTypeahead
            options={recipientOptions as any}
            query={searchText}
            open={previewOpen}
            handleRef={(h) => {
              previewHandle = h;
            }}
            onSelectEmail={(email) => {
              setSearchText(email);
              closePreview();
              queueMicrotask(() => inputRef?.blur());
            }}
          />
        </div>
        <Show when={props.isLoading() && searchText()}>
          <IconButton
            size="xs"
            iconSize={12}
            icon={LoadingSpinner}
            theme="clear"
            tooltip={{ label: 'Cancel search' }}
            class="h-3 w-3 shrink-0 [&_svg]:animate-spin"
            onClick={() => {
              setSearchText('');
              inputRef?.focus();
            }}
          />
        </Show>
        <Show when={!props.isLoading() && searchText()}>
          <IconButton
            size="xs"
            iconSize={12}
            icon={XIcon}
            theme="clear"
            tooltip={{ label: 'Clear search' }}
            class="h-3 w-3 shrink-0"
            onClick={() => {
              setSearchText('');
              inputRef?.focus();
            }}
          />
        </Show>
      </div>

      <Show when={selectedView() === VIEWCONFIG_DEFAULTS_IDS_ENUM.email}>
        <SegmentedControl
          disabled={searchText().trim().length > 0}
          size="SM"
          list={['inbox', 'sent', 'drafts']}
          value={emailView()}
          onChange={setEmailView}
        />
      </Show>
    </div>
  );
}
