import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  onCleanup,
} from 'solid-js';
import { Virtualizer, type VirtualizerHandle } from 'virtua/solid';
import type { CacheSnapshot } from 'virtua/unstable_core';
import { useList } from './context';
import type { Identifiable } from './selection-state';
import { useListViewport } from './Viewport';

const DEFAULT_ITEM_SIZE = 48;
const DEFAULT_OVERSCAN = 5;

export type ListVirtualProps<TItem extends Identifiable = Identifiable> = {
  children: (item: TItem, index: Accessor<number>) => JSX.Element;
  itemSize?: number;
  overscan?: number;
  cache?: CacheSnapshot;
  initialScrollOffset?: number;
  virtualizerRef?: (handle: VirtualizerHandle | undefined) => void;
};

export function ListVirtual<TItem extends Identifiable = Identifiable>(
  props: ListVirtualProps<TItem>
) {
  const { dataSource } = useList<TItem>();
  const viewport = useListViewport();
  const items = createMemo(() => [...dataSource.items()]);
  const [startMargin, setStartMargin] = createSignal(0);
  let restored = false;

  // Consumers can express mobile/full-frame insets as viewport padding
  // classes. Virtua still needs the resolved top padding for range and
  // scroll-to-index calculations.
  createEffect(() => {
    const element = viewport.element();
    if (!element) return;

    const updateStartMargin = () => {
      const padding = Number.parseFloat(
        window.getComputedStyle(element).paddingTop
      );
      setStartMargin(Number.isFinite(padding) ? padding : 0);
    };

    updateStartMargin();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateStartMargin);
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  const registerVirtualizer = (handle: VirtualizerHandle | undefined) => {
    viewport.setVirtualizer(handle);
    props.virtualizerRef?.(handle);

    if (handle && !restored && props.initialScrollOffset !== undefined) {
      handle.scrollTo(props.initialScrollOffset);
      restored = true;
    }
  };

  onCleanup(() => registerVirtualizer(undefined));

  return (
    <Virtualizer
      cache={props.cache}
      ref={registerVirtualizer}
      data={items()}
      startMargin={startMargin()}
      itemSize={props.itemSize ?? DEFAULT_ITEM_SIZE}
      bufferSize={
        (props.overscan ?? DEFAULT_OVERSCAN) *
        (props.itemSize ?? DEFAULT_ITEM_SIZE)
      }
    >
      {(item, index) => props.children(item, index)}
    </Virtualizer>
  );
}
