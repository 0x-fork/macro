import type { Accessor, JSX } from 'solid-js';
import { useList } from './context';
import type {
  ListActivateOptions,
  ListFocusOptions,
} from './create-list-state';
import type { Identifiable } from './selection-state';

export type ListItemState = {
  focused: Accessor<boolean>;
  selected: Accessor<boolean>;
  selectable: Accessor<boolean>;
  focus: (options?: ListFocusOptions) => void;
  activate: (options?: ListActivateOptions) => void;
  setSelected: (selected: boolean) => void;
  toggleSelected: () => void;
};

export type ListItemBindingProps<TItem extends Identifiable = Identifiable> = {
  item: TItem;
  children: (state: ListItemState) => JSX.Element;
};

export function ListItemBinding<TItem extends Identifiable = Identifiable>(
  props: ListItemBindingProps<TItem>
) {
  const { state: listState } = useList<TItem>();

  const state: ListItemState = {
    focused: () => listState.focus.id() === props.item.id,
    selected: () => listState.selection.isSelected(props.item.id),
    selectable: () => listState.selection.isSelectable(props.item),
    focus: (options) => {
      listState.focus.set(props.item.id, options);
    },
    activate: (options) => {
      listState.activate.id(props.item.id, options);
    },
    setSelected: (selected) => {
      if (selected === listState.selection.isSelected(props.item.id)) return;
      if (selected) listState.selection.select(props.item);
      else listState.selection.deselect(props.item.id);
    },
    toggleSelected: () => listState.selection.toggle(props.item),
  };

  return <>{props.children(state)}</>;
}
