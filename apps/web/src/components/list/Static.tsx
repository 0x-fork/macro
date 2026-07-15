import { type Accessor, For, type JSX } from 'solid-js';
import { useList } from './context';
import type { Identifiable } from './selection-state';

export type ListStaticProps<TItem extends Identifiable = Identifiable> = {
  children: (item: TItem, index: Accessor<number>) => JSX.Element;
};

export function ListStatic<TItem extends Identifiable = Identifiable>(
  props: ListStaticProps<TItem>
) {
  const { dataSource } = useList<TItem>();

  return (
    <For each={dataSource.items()}>
      {(item, index) => props.children(item, index)}
    </For>
  );
}
