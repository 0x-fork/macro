import {
  createContext,
  createRenderEffect,
  createUniqueId,
  on,
  type ParentProps,
  Suspense,
  useContext,
} from 'solid-js';
import { createListState, type ListState } from './create-list-state';
import type { Identifiable } from './selection-state';
import type { ListDataSource, ListDataSourceItem } from './types';

export type ListContextValue<TItem extends Identifiable = Identifiable> = {
  id: string;
  dataSource: ListDataSource<TItem>;
  state: ListState<TItem>;
};

const ListContext = createContext<ListContextValue<Identifiable>>();

export type ListRootProps<TSource extends ListDataSource<Identifiable>> =
  ParentProps<{
    dataSource: TSource;
    state?: ListState<ListDataSourceItem<TSource>>;
  }>;

function SyncDataSourceItems<TItem extends Identifiable>(props: {
  dataSource: ListDataSource<TItem>;
  state: ListState<TItem>;
}) {
  createRenderEffect(
    on(
      () => props.dataSource.items(),
      (sourceItems) => {
        const items = sourceItems;

        if (import.meta.env.DEV) {
          const ids = new Set<string>();
          for (const item of items) {
            if (ids.has(item.id)) {
              throw new Error(
                `List data source emitted duplicate item id: ${item.id}`
              );
            }
            ids.add(item.id);
          }
        }

        props.state.items.set(items);
      }
    )
  );

  return null;
}

export function ListRoot<TSource extends ListDataSource<Identifiable>>(
  props: ListRootProps<TSource>
) {
  type TItem = ListDataSourceItem<TSource>;

  // The state is intentionally stable for the lifetime of this provider.
  // Reactive changes belong inside the data source's accessors.
  const state = props.state ?? createListState<TItem>();

  const value: ListContextValue<Identifiable> = {
    id: createUniqueId(),
    get dataSource() {
      return props.dataSource;
    },
    state: state as ListState<Identifiable>,
  };

  return (
    <ListContext.Provider value={value}>
      {props.children}
      <Suspense>
        <SyncDataSourceItems dataSource={props.dataSource} state={state} />
      </Suspense>
    </ListContext.Provider>
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
