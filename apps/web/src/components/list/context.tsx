import {
  createContext,
  createRenderEffect,
  createUniqueId,
  on,
  type ParentProps,
  useContext,
} from 'solid-js';
import { createListState, type ListState } from './create-list-state';
import type { Identifiable } from './selection-state';
import type { ListDataSource } from './types';

export type ListContextValue<TItem extends Identifiable = Identifiable> = {
  id: string;
  dataSource: ListDataSource<TItem>;
  state: ListState<TItem>;
};

const ListContext = createContext<ListContextValue<Identifiable>>();

export type ListRootProps<TItem extends Identifiable> = ParentProps<{
  dataSource?: ListDataSource<TItem>;
  state?: ListState<TItem>;
}>;

export function ListRoot<TItem extends Identifiable = Identifiable>(
  props: ListRootProps<TItem>
) {
  // The state is intentionally stable for the lifetime of this provider.
  // Reactive changes belong inside the registered data source's accessors.
  const state =
    props.state ?? createListState<TItem>({ dataSource: props.dataSource });

  createRenderEffect(
    on(
      () => props.dataSource,
      (dataSource) => {
        if (dataSource) state.setDataSource(dataSource);
      }
    )
  );

  const value: ListContextValue<Identifiable> = {
    id: createUniqueId(),
    get dataSource() {
      const dataSource = state.dataSource();
      if (!dataSource) throw new Error('List has no registered data source');
      return dataSource;
    },
    state: state as ListState<Identifiable>,
  };

  return (
    <ListContext.Provider value={value}>{props.children}</ListContext.Provider>
  );
}

export function useList<
  TItem extends Identifiable = Identifiable,
>(): ListContextValue<TItem> {
  const context = useContext(ListContext);
  if (!context) throw new Error('useList must be used inside List.Root');
  return context as ListContextValue<TItem>;
}

export function useMaybeList<TItem extends Identifiable = Identifiable>():
  | ListContextValue<TItem>
  | undefined {
  return useContext(ListContext) as ListContextValue<TItem> | undefined;
}
