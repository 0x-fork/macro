import { createContext, type ParentProps, useContext } from 'solid-js';
import type { SoupCollection } from './create-soup-collection';

const SoupCollectionContext = createContext<SoupCollection>();

export type SoupCollectionProviderProps = ParentProps<{
  value: SoupCollection;
}>;

export function SoupCollectionProvider(props: SoupCollectionProviderProps) {
  return (
    <SoupCollectionContext.Provider value={props.value}>
      {props.children}
    </SoupCollectionContext.Provider>
  );
}

export function useSoupCollection() {
  const context = useContext(SoupCollectionContext);
  if (!context) {
    throw new Error(
      'useSoupCollection must be used inside SoupCollectionProvider'
    );
  }
  return context;
}

export const useMaybeSoupCollection = () => useContext(SoupCollectionContext);
