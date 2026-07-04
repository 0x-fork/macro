import { type Accessor, createContext, useContext } from 'solid-js';

const KeepAliveVisibilityContext = createContext<Accessor<boolean>>();

export const KeepAliveVisibilityProvider = KeepAliveVisibilityContext.Provider;

const ALWAYS_VISIBLE: Accessor<boolean> = () => true;

/**
 * Whether the surrounding block tree is the visible one. Keep-alive parks
 * recently viewed block trees detached-but-live (see KeepAliveMount); their
 * own DOM naturally disappears with the container, but anything they render
 * through portals into shared layout DOM (tab titles, header and toolbar
 * slots) — or write into shared split state (display names) — would keep
 * painting and stack up. Portal choke points and display-name effects gate
 * on this. Defaults to visible for normally mounted trees.
 */
export function useKeepAliveVisible(): Accessor<boolean> {
  return useContext(KeepAliveVisibilityContext) ?? ALWAYS_VISIBLE;
}
