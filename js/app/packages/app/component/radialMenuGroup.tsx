import {
  createContext,
  createSignal,
  type ParentProps,
  useContext,
} from 'solid-js';

/**
 * Coordinates a set of radial menus so at most one is open at a time. The only
 * shared state is which menu currently holds the slot; each menu derives its own
 * open state as "am I the active one?", so two menus being open is impossible by
 * construction (no cross-watching effects).
 */
export interface RadialMenuGroup {
  /** Is `id` the currently-open menu? */
  isOpen: (id: symbol) => boolean;
  /** Open `id`, atomically closing whichever menu was open. */
  open: (id: symbol) => void;
  /** Close `id` — only if it currently holds the slot. */
  close: (id: symbol) => void;
}

export function createRadialMenuGroup(): RadialMenuGroup {
  const [activeId, setActiveId] = createSignal<symbol | null>(null);
  return {
    isOpen: (id) => activeId() === id,
    open: (id) => setActiveId(id),
    close: (id) => setActiveId((cur) => (cur === id ? null : cur)),
  };
}

// The context default is a single shared group, so exclusivity holds globally with
// no provider required. Wrap a subtree in <RadialMenuGroupProvider> to scope it.
const RadialMenuGroupContext = createContext<RadialMenuGroup>(
  createRadialMenuGroup()
);

/** Scope radial-menu exclusivity to a subtree (members close each other, but not
 * menus outside the provider). */
export function RadialMenuGroupProvider(props: ParentProps) {
  return (
    <RadialMenuGroupContext.Provider value={createRadialMenuGroup()}>
      {props.children}
    </RadialMenuGroupContext.Provider>
  );
}

export const useRadialMenuGroup = (): RadialMenuGroup =>
  useContext(RadialMenuGroupContext);
