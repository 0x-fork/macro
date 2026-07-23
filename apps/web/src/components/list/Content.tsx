import {
  type Accessor,
  createContext,
  createMemo,
  type JSX,
  Show,
  useContext,
} from 'solid-js';
import { useList } from './context';

export type ListContentProps = {
  children: JSX.Element;
  forceEmpty?: boolean;
};

const ListContentContext = createContext<Accessor<boolean>>(() => false);

export function ListContent(props: ListContentProps) {
  return (
    <ListContentContext.Provider value={() => props.forceEmpty ?? false}>
      {props.children}
    </ListContentContext.Provider>
  );
}

const useListContentState = () => {
  const { dataSource } = useList();
  const forceEmpty = useContext(ListContentContext);
  const hasItems = createMemo(() => dataSource.items().length > 0);
  const error = () => dataSource.error();
  const loading = () => dataSource.isLoading();
  return { forceEmpty, hasItems, error, loading };
};

export function ListItems(props: { children: JSX.Element }) {
  const state = useListContentState();
  return (
    <Show when={!state.forceEmpty() && state.hasItems()}>{props.children}</Show>
  );
}

export function ListLoading(props: { children: JSX.Element }) {
  const state = useListContentState();
  return (
    <Show
      when={
        !state.forceEmpty() &&
        !state.hasItems() &&
        !state.error() &&
        state.loading()
      }
    >
      {props.children}
    </Show>
  );
}

export function ListError(props: {
  children: (error: unknown) => JSX.Element;
}) {
  const state = useListContentState();
  return (
    <Show when={!state.forceEmpty() && !state.hasItems() && state.error()}>
      {(error) => props.children(error())}
    </Show>
  );
}

export function ListEmpty(props: { children: JSX.Element }) {
  const state = useListContentState();
  return (
    <Show
      when={
        state.forceEmpty() ||
        (!state.hasItems() && !state.error() && !state.loading())
      }
    >
      {props.children}
    </Show>
  );
}
