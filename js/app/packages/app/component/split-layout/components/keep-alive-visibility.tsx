import {
  type Accessor,
  createContext,
  createMemo,
  type FlowComponent,
  useContext,
} from 'solid-js';

const KeepAliveVisibilityContext = createContext<Accessor<boolean>>();

const ALWAYS_VISIBLE: Accessor<boolean> = () => true;

/**
 * Provides the keep-alive visibility of the surrounding tree, ANDed with
 * any parent keep-alive scope: a tree nested inside a parked tree (e.g. a
 * preview panel's keep-alive inside a parked list view) is only visible
 * when every level is.
 */
export const KeepAliveVisibilityProvider: FlowComponent<{
  value: Accessor<boolean>;
}> = (props) => {
  const parent = useContext(KeepAliveVisibilityContext) ?? ALWAYS_VISIBLE;
  const combined = createMemo(() => parent() && props.value());
  return (
    <KeepAliveVisibilityContext.Provider value={combined}>
      {props.children}
    </KeepAliveVisibilityContext.Provider>
  );
};

/**
 * Whether the surrounding block tree is the visible one. Keep-alive parks
 * recently viewed block trees detached-but-live (see KeepAliveMount); their
 * own DOM naturally disappears with the container, but anything they render
 * through portals into shared layout DOM (tab titles, header and toolbar
 * slots) — or write into shared split state (display names) — would keep
 * painting and stack up. Portal choke points, display-name effects, hotkey
 * conditions, and entry-state access gate on this. Defaults to visible for
 * normally mounted trees.
 */
export function useKeepAliveVisible(): Accessor<boolean> {
  return useContext(KeepAliveVisibilityContext) ?? ALWAYS_VISIBLE;
}
