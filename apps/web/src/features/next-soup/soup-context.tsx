import {
  createListState,
  type ListDataSource,
  type ListFocusAttempt,
  type ListState,
} from '@app/components/list';
import type { SoupRow } from '@app/features/soup';
import {
  createContext,
  createSignal,
  type FlowComponent,
  useContext,
} from 'solid-js';
import { createSoupState, type SoupState } from './create-soup-state';

type SoupListBehaviour = {
  isNavigable: (row: SoupRow) => boolean;
  isSelectable: (row: SoupRow) => boolean;
  suppressFocus?: (attempt: ListFocusAttempt<SoupRow>) => boolean;
};

export type SoupListConfiguration = SoupListBehaviour & {
  dataSource: ListDataSource<SoupRow>;
};

export type Soup = SoupState & {
  list: ListState<SoupRow>;
  configure: (configuration: SoupListConfiguration) => void;
};

const SoupContext = createContext<Soup>();

export const useSoup = () => {
  const context = useContext(SoupContext);

  if (!context) {
    throw new Error('useSoup can only be used under a SoupContext.Provider');
  }
  return context;
};

export const useMaybeSoup = () => useContext(SoupContext);

interface SoupContextProviderProps {
  soup?: SoupState;
}

export const SoupContextProvider: FlowComponent<SoupContextProviderProps> = (
  props
) => {
  const legacy = props.soup ?? createSoupState();
  const [behaviour, setBehaviour] = createSignal<SoupListBehaviour>();
  const list = createListState<SoupRow>({
    isNavigable: (row) => behaviour()?.isNavigable(row) ?? false,
    isSelectable: (row) => behaviour()?.isSelectable(row) ?? false,
    suppressFocus: (attempt) => behaviour()?.suppressFocus?.(attempt) ?? false,
  });
  const value: Soup = {
    ...legacy,
    list,
    configure: (configuration) => {
      setBehaviour(configuration);
      list.setDataSource(configuration.dataSource);
    },
  };

  return (
    <SoupContext.Provider value={value}>{props.children}</SoupContext.Provider>
  );
};
