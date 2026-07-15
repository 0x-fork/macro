import {
  createContext,
  createEffect,
  createSignal,
  type JSX,
  onCleanup,
  type ParentProps,
  splitProps,
  useContext,
} from 'solid-js';
import type { VirtualizerHandle } from 'virtua/solid';
import { useList } from './context';

export type ListViewportContextValue = {
  element: () => HTMLDivElement | undefined;
  virtualizer: () => VirtualizerHandle | undefined;
  setVirtualizer: (handle: VirtualizerHandle | undefined) => void;
};

const ListViewportContext = createContext<ListViewportContextValue>();

export type ListViewportProps = ParentProps<
  Omit<JSX.HTMLAttributes<HTMLDivElement>, 'ref' | 'onScroll'> & {
    ref?: (element: HTMLDivElement) => void;
    nearEndOffset?: number;
    onNearEnd?: () => unknown | Promise<unknown>;
    onNearEndError?: (error: unknown) => void;
    onScrollOffsetChange?: (offset: number) => void;
  }
>;

export function ListViewport(props: ListViewportProps) {
  const { dataSource } = useList();
  const [local, rest] = splitProps(props, [
    'ref',
    'class',
    'children',
    'nearEndOffset',
    'onNearEnd',
    'onNearEndError',
    'onScrollOffsetChange',
  ]);

  const [element, setElement] = createSignal<HTMLDivElement>();
  const [virtualizer, setVirtualizer] = createSignal<VirtualizerHandle>();
  let loadingNearEnd = false;

  const value: ListViewportContextValue = {
    element,
    virtualizer,
    setVirtualizer,
  };

  const loadNearEnd = async () => {
    if (loadingNearEnd || !dataSource.hasMore() || dataSource.isLoadingMore()) {
      return;
    }

    loadingNearEnd = true;
    try {
      const loadMore = local.onNearEnd ?? dataSource.loadMore;
      await loadMore();
    } catch (error) {
      local.onNearEndError?.(error);
    } finally {
      loadingNearEnd = false;
    }
  };

  const checkNearEnd = (target = element()) => {
    if (!target) return;
    const threshold = Math.max(local.nearEndOffset ?? 100, target.clientHeight);
    const distanceFromEnd =
      target.scrollHeight - target.clientHeight - target.scrollTop;

    if (distanceFromEnd <= threshold) void loadNearEnd();
  };

  const onScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    local.onScrollOffsetChange?.(event.currentTarget.scrollTop);
    checkNearEnd(event.currentTarget);
  };

  // An initial page (or a subsequent page) may not be tall enough to make the
  // viewport scroll. Recheck after item/loading changes and viewport resizes so
  // pagination can continue until the viewport is filled.
  createEffect(() => {
    dataSource.items().length;
    dataSource.hasMore();
    dataSource.isLoadingMore();
    const target = element();
    if (!target) return;

    queueMicrotask(() => {
      if (element() === target) checkNearEnd(target);
    });

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => checkNearEnd(target));
    observer.observe(target);
    onCleanup(() => observer.disconnect());
  });

  onCleanup(() => {
    setElement(undefined);
    setVirtualizer(undefined);
  });

  return (
    <ListViewportContext.Provider value={value}>
      <div
        {...rest}
        ref={(node) => {
          setElement(node);
          local.ref?.(node);
        }}
        class={[
          'size-full min-h-0 min-w-0 overflow-y-auto overscroll-none [contain:strict]',
          local.class,
        ]
          .filter(Boolean)
          .join(' ')}
        onScroll={onScroll}
      >
        {local.children}
      </div>
    </ListViewportContext.Provider>
  );
}

export function useListViewport() {
  const context = useContext(ListViewportContext);
  if (!context) {
    throw new Error('useListViewport must be used inside List.Viewport');
  }
  return context;
}

export const useMaybeListViewport = () => useContext(ListViewportContext);
