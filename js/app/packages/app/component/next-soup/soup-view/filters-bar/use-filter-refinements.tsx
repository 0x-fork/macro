import {
  getViewPreset,
  type PresetContext,
  VIEW_TAB_PRESETS,
} from '@app/component/app-sidebar/soup-filter-presets';
import {
  type FilterContext,
  type FilterID,
  NO_ASSIGNEE,
} from '@app/component/next-soup/filters';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import type { ListView } from '@app/constants/list-views';
import { isListViewID } from '@app/constants/list-views';
import { UserIcon } from '@core/component/UserIcon';
import { useUserContext, useUserId } from '@core/context/user';
import { deepEqual } from '@core/util/compareUtils';
import CircleDashedIcon from '@phosphor/circle-dashed.svg';
import { useContacts } from '@queries/contacts/contacts';
import { batch, createMemo, createSignal, type JSX } from 'solid-js';
import type {
  ConsolidatedFilter,
  FilterValue,
} from './consolidated-filter-chip';
import { buildContactLabel, VIEW_FACETS } from './facet-views';
import type { SearchableOption } from './searchable-multi-select';
import { useTaskStatusFilter } from './task-status-filter';

const sameIds = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const sb = [...b].sort();
  return [...a].sort().every((v, i) => v === sb[i]);
};

// Filter IDs that are set by tabs and should not be shown as removable chips
const TAB_ONLY_FILTERS = new Set([
  'inbox',
  'noise',
  'explicit-noise',
  'channels',
  'file-folder',
  'shared-entity',
  'shared-agent',
  'assigned-to',
  'no-drafts',
  'email-drafts',
  'not-task',
]);

/**
 * Hook that provides detection of active filter refinements beyond tab defaults,
 * and a function to reset filters to the current tab's default state.
 */
export function useFilterRefinements() {
  const {
    soup,
    items,
    queryFilters,
    assigneeFilter,
    setAssigneeFilter,
    activeTab,
  } = useSoupView();
  const filterData = () => queryFilters.state;
  const panel = useSplitPanelOrThrow();
  const user = useUserContext();
  const contacts = useContacts();
  const currentUserId = useUserId();
  const taskStatus = useTaskStatusFilter();

  const isOptionActive = (facetId: string, optionId: string) =>
    soup.facets.has(facetId, optionId);

  const getPresetContext = (): PresetContext => ({
    userId: user.userId(),
    email: user.email(),
    // Filter refinements don't surface admin-gated tabs, so passing
    // false here is safe — the value only matters where the resolver
    // gates on it (companies → hidden).
    isTeamAdmin: false,
  });

  const currentView = createMemo(() => {
    const content = panel.handle.content();

    if (content.type !== 'component' || !isListViewID(content.id)) return;

    return content.id;
  });

  const currentPreset = createMemo(() => {
    const view = currentView();
    if (!view) return undefined;
    const tab = activeTab() ?? VIEW_TAB_PRESETS[view]?.default;
    if (!tab) return undefined;
    return getViewPreset(view, tab, getPresetContext());
  });

  const hasActiveRefinements = createMemo(() => {
    const preset = currentPreset();
    if (!preset) return false;

    const expectedIds = new Set([
      ...(preset.clientFilters.and ?? []),
      ...(preset.clientFilters.or ?? []),
    ]);

    const currentIds = new Set(soup.predicates.activeIds() as FilterID[]);

    const hasClientFilterDiff =
      expectedIds.size !== currentIds.size ||
      [...expectedIds].some((id) => !currentIds.has(id as FilterID));

    // Check if there are any external filters set (normalize undefined vs {} for comparison)
    const currentFilterData = filterData();
    const presetFilters = preset.filters;
    const hasQueryFilterDiff =
      !deepEqual(currentFilterData.include, presetFilters.include ?? {}) ||
      !deepEqual(currentFilterData.exclude, presetFilters.exclude ?? {}) ||
      currentFilterData.emailView !== presetFilters.emailView;

    const hasSubFilters = assigneeFilter().length > 0;

    // a facet is a refinement only if it diverges from the preset's seed
    const seed = preset.initialFacets ?? {};
    const sel = soup.facets.selection;
    const hasFacetRefinements = [
      ...new Set([...Object.keys(sel), ...Object.keys(seed)]),
    ].some((k) => !sameIds(sel[k] ?? [], seed[k] ?? []));

    return (
      hasClientFilterDiff ||
      hasQueryFilterDiff ||
      hasSubFilters ||
      hasFacetRefinements
    );
  });

  /**
   * Human-readable options for the assignee sub-filter, keyed by assignee ID.
   * Mirrors the same logic used in UnifiedFilterDropdown's assigneeOptions.
   */
  const assigneeOptionsMap = createMemo(
    (): Map<string, { label: string; icon?: () => JSX.Element }> => {
      const uid = currentUserId();
      const map = new Map<
        string,
        { label: string; icon?: () => JSX.Element }
      >();
      map.set(NO_ASSIGNEE, {
        label: 'Unassigned',
        icon: () => <CircleDashedIcon class="size-3 text-ink-muted" />,
      });
      for (const contact of contacts()) {
        map.set(contact.id, {
          label: buildContactLabel(contact, uid),
          icon: () => (
            <UserIcon
              id={contact.id}
              size="sm"
              suppressClick
              showTooltip={false}
            />
          ),
        });
      }
      return map;
    }
  );

  /**
   * Searchable options for the assignee filter (for use in searchable multi-select).
   */
  const assigneeSearchableOptions = createMemo((): SearchableOption[] => {
    const uid = currentUserId();
    const noAssigneeOption: SearchableOption = {
      id: NO_ASSIGNEE,
      label: 'Unassigned',
      icon: () => <CircleDashedIcon class="size-3.5 text-ink-muted" />,
    };
    let meOption: SearchableOption | undefined;
    const otherContactOptions: SearchableOption[] = [];
    for (const contact of contacts()) {
      const opt: SearchableOption = {
        id: contact.id,
        label: buildContactLabel(contact, uid),
        icon: () => (
          <UserIcon
            id={contact.id}
            size="sm"
            suppressClick
            showTooltip={false}
          />
        ),
      };
      if (contact.id === uid) {
        meOption = opt;
      } else {
        otherContactOptions.push(opt);
      }
    }
    return [
      ...(meOption ? [meOption] : []),
      noAssigneeOption,
      ...otherContactOptions,
    ];
  });

  /**
   * Handler for assignee filter changes.
   */
  const handleAssigneeChange = (ids: string[]) => setAssigneeFilter(ids);

  /**
   * Get filter categories for the current view
   */
  const viewCategories = createMemo(() => {
    const view = currentView();
    if (!view) return [];
    return VIEW_FACETS[view as ListView] ?? [];
  });

  /**
   * Cache for consolidated filter chips, similar to chipCache but for the new format.
   * We track the view and tab to invalidate when they change, since cached chips
   * may close over stale values (e.g. group.allOptions, coveredByView, presetFilterIds).
   */
  const consolidatedChipCache = new Map<string, ConsolidatedFilter>();
  let lastCacheViewId: ListView | undefined;
  let lastCacheTab: string | undefined;

  const getOrCreateConsolidatedChip = (
    key: string,
    build: () => ConsolidatedFilter
  ): ConsolidatedFilter => {
    let chip = consolidatedChipCache.get(key);
    if (!chip) {
      chip = build();
      consolidatedChipCache.set(key, chip);
    }
    return chip;
  };

  /**
   * Returns consolidated filters grouped by category.
   * Multiple values in the same category are shown in a single chip.
   */
  const consolidatedFiltersList = createMemo((): ConsolidatedFilter[] => {
    const view = currentView();
    const preset = currentPreset();
    const tab = activeTab();

    // Invalidate cache when view or tab changes, since cached chips
    // close over render-local values like group.allOptions, coveredByView, presetFilterIds
    if (view !== lastCacheViewId || tab !== lastCacheTab) {
      consolidatedChipCache.clear();
      lastCacheViewId = view;
      lastCacheTab = tab;
    }

    const presetFilterIds = new Set([
      ...(preset?.clientFilters.and ?? []),
      ...(preset?.clientFilters.or ?? []),
    ]);

    const filters: ConsolidatedFilter[] = [];
    const seenKeys = new Set<string>();

    // Group view category filters by category
    const categoryGroups = new Map<
      string,
      {
        label: string;
        labelPlural?: string;
        allOptions: FilterValue[];
        multiple: boolean;
      }
    >();

    for (const category of viewCategories()) {
      // Status has a dedicated chip below.
      if (view === 'tasks' && category.id === 'task-status') continue;

      const activeValues: FilterValue[] = [];
      const allOptions: FilterValue[] = [];

      for (const option of category.options) {
        allOptions.push({
          id: option.id,
          label: option.label,
          icon: option.icon,
        });

        if (
          isOptionActive(category.id, option.id) &&
          !TAB_ONLY_FILTERS.has(option.id) &&
          !presetFilterIds.has(option.id as FilterID)
        ) {
          activeValues.push({
            id: option.id,
            label: option.label,
            icon: option.icon,
          });
        }
      }

      if (activeValues.length > 0) {
        categoryGroups.set(category.id, {
          label: category.label,
          labelPlural: category.labelPlural,
          allOptions,
          multiple: category.multiple ?? true,
        });
      }
    }

    // Build consolidated chips for each category group
    for (const [categoryId, group] of categoryGroups) {
      const key = `category:${categoryId}`;
      seenKeys.add(key);

      // Helper to get current active values for this category (computed fresh)
      const getActiveValues = (): FilterValue[] => {
        const result: FilterValue[] = [];
        for (const opt of group.allOptions) {
          if (
            isOptionActive(categoryId, opt.id) &&
            !TAB_ONLY_FILTERS.has(opt.id) &&
            !presetFilterIds.has(opt.id as FilterID)
          ) {
            result.push(opt);
          }
        }
        return result;
      };

      filters.push(
        getOrCreateConsolidatedChip(key, () => ({
          key,
          categoryLabel: group.label,
          categoryLabelPlural: group.labelPlural,
          values: getActiveValues, // Accessor - computed fresh each render
          availableOptions: group.allOptions,
          multiple: group.multiple,
          isValueActive: (id) => isOptionActive(categoryId, id),
          onToggleValue: (id) => soup.facets.toggle(categoryId, id),
          onRemoveAll: () => {
            const currentValues = getActiveValues();
            batch(() => {
              for (const value of currentValues) {
                soup.facets.toggle(categoryId, value.id);
              }
            });
          },
        }))
      );
    }

    // Dedicated chip: the generic builder would hide the preset-seeded default.
    const pushTaskStatusChip = () => {
      if (view !== 'tasks') return;
      const statusCategory = viewCategories().find(
        (c) => c.id === 'task-status'
      );
      if (!statusCategory) return;

      const allOptions: FilterValue[] = statusCategory.options.map((o) => ({
        id: o.id,
        label: o.label,
        icon: o.icon,
      }));

      const getActiveValues = (): FilterValue[] =>
        allOptions.filter((o) => taskStatus.isActive(o.id as FilterID));

      // No chip when not narrowed (empty, or all selected = no filter).
      const activeCount = getActiveValues().length;
      if (activeCount === 0 || activeCount === allOptions.length) return;

      const key = 'status';
      seenKeys.add(key);

      filters.push(
        getOrCreateConsolidatedChip(key, () => ({
          key,
          categoryLabel: 'Status',
          categoryLabelPlural: 'Statuses',
          values: getActiveValues,
          availableOptions: allOptions,
          multiple: true,
          isValueActive: (id) => taskStatus.isActive(id as FilterID),
          onToggleValue: (id) => taskStatus.toggle(id as FilterID),
          onRemoveAll: () => taskStatus.clear(),
        }))
      );
    };

    // Assignee filter (consolidated) - using searchable approach
    const pushAssigneeConsolidatedChip = () => {
      const key = 'assignee';
      const popupOpen =
        consolidatedChipCache.get(key)?.isPopupOpen?.() ?? false;
      const ids = assigneeFilter();
      if (ids.length === 0 && !popupOpen) return;

      seenKeys.add(key);

      // Compute values as accessor for reactivity, including icons
      const getValues = (): FilterValue[] =>
        assigneeFilter().map((id) => {
          const opt = assigneeOptionsMap().get(id);
          return {
            id,
            label: opt?.label ?? id,
            icon: opt?.icon,
          };
        });

      filters.push(
        getOrCreateConsolidatedChip(key, () => {
          const [isPopupOpen, _setPopupOpen] = createSignal(false);
          const setPopupOpen = (v: boolean) => {
            if (!v) {
              queueMicrotask(() =>
                panel.panelRef()?.focus({ preventScroll: true })
              );
            }
            _setPopupOpen(v);
          };
          return {
            key,
            categoryLabel: 'Assignee',
            values: getValues,
            searchableOptions: assigneeSearchableOptions,
            activeSearchableIds: assigneeFilter,
            onSearchableChange: handleAssigneeChange,
            searchPlaceholder: 'Search assignees...',
            isPopupOpen,
            setPopupOpen,
            onRemoveAll: () => handleAssigneeChange([]),
          };
        })
      );
    };

    pushTaskStatusChip();
    pushAssigneeConsolidatedChip();

    // Evict stale chips
    for (const key of consolidatedChipCache.keys()) {
      if (!seenKeys.has(key)) consolidatedChipCache.delete(key);
    }

    return filters;
  });

  const getFilterContext = (): FilterContext => ({
    userId: currentUserId(),
    assignees: assigneeFilter(),
  });

  /**
   * Does at least one item pass the BASE preset's client predicates? Used to
   * decide whether the empty-state banner should claim items are hidden.
   * Short-circuits at the first match.
   *
   * Note: items() is already server-filtered by current query filters, so if
   * the user has tightened the server query this may return false even when
   * items exist. `hasHiddenItems` below compensates by being sticky.
   */
  const baseHasItems = createMemo(() => {
    const preset = currentPreset();
    if (!preset) return false;
    const baseAnd = preset.clientFilters.and ?? [];
    const baseOr = preset.clientFilters.or ?? [];
    if (baseAnd.length === 0 && baseOr.length === 0) return items().length > 0;

    const ctx = getFilterContext();
    for (const entity of items()) {
      let andOk = true;
      for (const id of baseAnd) {
        const cfg = soup.predicates.getConfig(id);
        if (cfg && !cfg.predicate(entity, ctx)) {
          andOk = false;
          break;
        }
      }
      if (!andOk) continue;
      if (baseOr.length > 0) {
        let orOk = false;
        for (const id of baseOr) {
          const cfg = soup.predicates.getConfig(id);
          if (cfg?.predicate(entity, ctx)) {
            orOk = true;
            break;
          }
        }
        if (!orOk) continue;
      }
      return true;
    }
    return false;
  });

  /**
   * Sticky-true while refinements are active so the banner doesn't flicker
   * off when a server refetch transiently zeroes out items(). Resets on
   * view/tab change, and snaps to the live state whenever refinements clear.
   *
   * Imperfect by design: if the user mounts with refinements already active
   * and the server returns zero items, this stays false. Getting a true
   * answer would need a separate base-preset query.
   */
  const hasHiddenItems = createMemo<{ key: string; value: boolean }>((prev) => {
    const key = `${currentView() ?? ''}|${activeTab() ?? ''}`;
    const refinementsActive = hasActiveRefinements();
    const itemsExist = baseHasItems();

    if (prev?.key !== key || !refinementsActive) {
      return { key, value: itemsExist };
    }
    return { key, value: prev.value || itemsExist };
  });

  const hasHiddenItemsValue = () => hasHiddenItems().value;

  const _getFilterQuery = (optionId: string) => {
    const filter = soup.predicates.getConfig(optionId);
    if (!filter?.query) return undefined;
    return typeof filter.query === 'function'
      ? filter.query(getFilterContext())
      : filter.query;
  };

  const resetToTabDefaults = () => {
    const preset = currentPreset();
    if (!preset) return;

    batch(() => {
      soup.predicates.set(preset.clientFilters);
      queryFilters.replace(preset.filters ?? null);
      // restore the tab's seeded facets, dropping user refinements
      soup.facets.hydrate(preset.initialFacets ?? {});
      setAssigneeFilter([]);
    });
  };

  return {
    hasActiveRefinements,
    hasHiddenItems: hasHiddenItemsValue,
    resetToTabDefaults,
    currentView,
    consolidatedFiltersList,
  };
}
