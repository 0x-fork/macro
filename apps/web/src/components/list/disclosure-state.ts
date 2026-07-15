import { type Accessor, createMemo, createSignal } from 'solid-js';

export type CreateDisclosureOptions = {
  /**
   * Whether ids are expanded unless explicitly toggled. Grouping is typically
   * `true` (groups open, track which are collapsed); nested sub-items are
   * typically `false` (closed, track which are opened). Defaults to `false`.
   */
  defaultExpanded?: boolean;
  /** Ids to start in the non-default state. */
  initialToggled?: Iterable<string>;
};

export type DisclosureState = {
  isExpanded: (id: string) => boolean;
  expand: (id: string) => void;
  collapse: (id: string) => void;
  toggle: (id: string) => void;
  setExpanded: (id: string, expanded: boolean) => void;
  /** Expand everything. Pass the id universe when `defaultExpanded` is false. */
  expandAll: (ids?: Iterable<string>) => void;
  /** Collapse everything. Pass the id universe when `defaultExpanded` is true. */
  collapseAll: (ids?: Iterable<string>) => void;
  /** Return to the default state for every id. */
  reset: () => void;
  /** The set of ids currently in the non-default state (reactive). */
  toggledIds: Accessor<ReadonlySet<string>>;
};

/**
 * Generic expand/collapse state for a set of ids. Internally it only tracks the
 * ids whose state differs from the default, so it works without knowing the full
 * universe of ids (which a virtualized/paginated list rarely has up front).
 *
 * A plain mutable Set holds the tracked ids; a version signal (read in the
 * getters, bumped on mutation) supplies reactivity, so a toggle mutates one
 * entry in place rather than re-cloning the collection.
 */
export const createDisclosureState = (
  options: CreateDisclosureOptions = {}
): DisclosureState => {
  const { defaultExpanded = false, initialToggled } = options;

  // Only contains ids in the non-default state; an absent id is at the default.
  const toggled = new Set<string>(initialToggled);
  // Pure invalidation signal: `track()` subscribes, `touch()` always notifies.
  const [track, touch] = createSignal(undefined, { equals: false });

  // Untracked read, for use inside actions (avoids creating a subscription).
  const expandedOf = (id: string): boolean =>
    toggled.has(id) ? !defaultExpanded : defaultExpanded;

  const isExpanded = (id: string): boolean => {
    track();
    return expandedOf(id);
  };

  const setExpanded = (id: string, expanded: boolean) => {
    // An id is tracked precisely when its desired state differs from default.
    const shouldTrack = expanded !== defaultExpanded;
    const changed = shouldTrack ? !toggled.has(id) : toggled.has(id);
    if (!changed) return;
    if (shouldTrack) toggled.add(id);
    else toggled.delete(id);
    touch();
  };

  const expand = (id: string) => setExpanded(id, true);
  const collapse = (id: string) => setExpanded(id, false);
  const toggle = (id: string) => setExpanded(id, !expandedOf(id));

  const replaceWith = (ids?: Iterable<string>) => {
    toggled.clear();
    for (const id of ids ?? []) toggled.add(id);
    touch();
  };

  const expandAll = (ids?: Iterable<string>) =>
    replaceWith(defaultExpanded ? undefined : ids);

  const collapseAll = (ids?: Iterable<string>) =>
    replaceWith(defaultExpanded ? ids : undefined);

  const reset = () => {
    if (toggled.size === 0) return;
    toggled.clear();
    touch();
  };

  const toggledIds = createMemo<ReadonlySet<string>>(() => {
    track();
    return new Set(toggled);
  });

  return {
    isExpanded,
    expand,
    collapse,
    toggle,
    setExpanded,
    expandAll,
    collapseAll,
    reset,
    toggledIds,
  };
};
