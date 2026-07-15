import { children, type JSX, Match, Switch } from 'solid-js';
import { useList } from './context';

export type ListContentProps = {
  children: JSX.Element;
  loading?: JSX.Element;
  empty?: JSX.Element;
  error?: (error: unknown) => JSX.Element;
  forceEmpty?: boolean;
};

export function ListContent(props: ListContentProps) {
  const { dataSource } = useList();
  const content = children(() => props.children);
  const loading = children(() => props.loading);
  const empty = children(() => props.empty);

  return (
    <Switch fallback={empty()}>
      <Match when={props.forceEmpty}>{empty()}</Match>
      <Match when={dataSource.items().length > 0}>{content()}</Match>
      <Match when={dataSource.error()}>
        {(error) => props.error?.(error())}
      </Match>
      <Match when={dataSource.isLoading()}>{loading()}</Match>
    </Switch>
  );
}
