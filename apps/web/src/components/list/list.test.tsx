import { fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { createListState, List, useList } from '.';
import type { ListDataSource } from './types';

type TestItem = {
  id: string;
  category: 'row' | 'header';
};

const rowItem = (id: string): TestItem => ({
  id: `row:${id}`,
  category: 'row',
});

function createTestSource(initialItems: TestItem[] = []) {
  const [items, setItems] = createSignal<readonly TestItem[]>(initialItems);
  const [isLoading, setIsLoading] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(false);
  const loadMore = vi.fn(async () => {});

  const source: ListDataSource<TestItem> = {
    items,
    isLoading,
    isFetching: () => false,
    error: () => undefined,
    hasMore,
    isLoadingMore: () => false,
    loadMore,
    refresh: async () => {},
  };

  return { source, setItems, setIsLoading, setHasMore, loadMore };
}

describe('List', () => {
  it('syncs source items into its default state', () => {
    const testSource = createTestSource([rowItem('a')]);
    let state: ReturnType<typeof useList>['state'] | undefined;

    function Probe() {
      state = useList().state;
      return null;
    }

    render(() => (
      <List.Root dataSource={testSource.source}>
        <Probe />
      </List.Root>
    ));

    expect(state?.items.count()).toBe(1);
    expect(testSource.source.items()).toHaveLength(1);
  });

  it('renders loading, empty, and populated content without replacing the viewport', async () => {
    const testSource = createTestSource();
    testSource.setIsLoading(true);

    render(() => (
      <List.Root dataSource={testSource.source}>
        <List.Viewport
          data-testid="viewport"
          class="mobile:pt-(--mobile-content-inset-top)"
        >
          <List.Content loading={<div>Loading</div>} empty={<div>Empty</div>}>
            <List.Static<TestItem>>
              {(item) => <div>{item.id}</div>}
            </List.Static>
          </List.Content>
        </List.Viewport>
      </List.Root>
    ));

    const viewport = screen.getByTestId('viewport');
    expect(screen.getByText('Loading')).toBeTruthy();

    testSource.setIsLoading(false);
    await Promise.resolve();
    expect(screen.getByText('Empty')).toBeTruthy();
    expect(screen.getByTestId('viewport')).toBe(viewport);

    testSource.setItems([rowItem('a')]);
    await Promise.resolve();
    expect(screen.getByText('row:a')).toBeTruthy();
    expect(screen.getByTestId('viewport')).toBe(viewport);
  });

  it('lets consumers define which of their items are selectable', () => {
    const header: TestItem = {
      id: 'header:one',
      category: 'header',
    };
    const row = rowItem('a');
    const testSource = createTestSource([header, row]);
    let selectedIds: string[] = [];

    function Items() {
      const { state: listState } = useList<TestItem>();
      return (
        <List.Static<TestItem>>
          {(item) => (
            <List.Item item={item}>
              {(state) => (
                <button
                  type="button"
                  onClick={() => {
                    state.setSelected(true);
                    selectedIds = listState.selection
                      .selected()
                      .map((selected) => selected.id);
                  }}
                >
                  {item.id}
                </button>
              )}
            </List.Item>
          )}
        </List.Static>
      );
    }

    function App() {
      const state = createListState<TestItem>({
        isNavigable: (item) => item.category === 'row',
        isSelectable: (item) => item.category === 'row',
      });
      return (
        <List.Root dataSource={testSource.source} state={state}>
          <Items />
        </List.Root>
      );
    }

    render(() => <App />);

    fireEvent.click(screen.getByText('header:one'));
    expect(selectedIds).toEqual([]);

    fireEvent.click(screen.getByText('row:a'));
    expect(selectedIds).toEqual(['row:a']);
  });

  it('renders arbitrary identifiable items such as notifications', () => {
    type NotificationItem = {
      id: string;
      eventType: string;
      message: string;
    };

    const notifications: NotificationItem[] = [
      {
        id: 'notification:one',
        eventType: 'channel_mention',
        message: 'You were mentioned',
      },
    ];
    const source: ListDataSource<NotificationItem> = {
      items: () => notifications,
      isLoading: () => false,
      isFetching: () => false,
      error: () => undefined,
      hasMore: () => false,
      isLoadingMore: () => false,
      loadMore: async () => {},
      refresh: async () => {},
    };

    render(() => (
      <List.Root dataSource={source}>
        <List.Static<NotificationItem>>
          {(notification) => (
            <List.Item item={notification}>
              {(state) => (
                <button type="button" onClick={state.toggleSelected}>
                  {state.selected()
                    ? 'Selected notification'
                    : notification.message}
                </button>
              )}
            </List.Item>
          )}
        </List.Static>
      </List.Root>
    ));

    fireEvent.click(screen.getByText('You were mentioned'));
    expect(screen.getByText('Selected notification')).toBeTruthy();
  });

  it('requests more items when the viewport is underfilled', async () => {
    const testSource = createTestSource([rowItem('a')]);

    render(() => (
      <List.Root dataSource={testSource.source}>
        <List.Viewport data-testid="viewport">
          <List.Static<TestItem>>{(item) => <div>{item.id}</div>}</List.Static>
        </List.Viewport>
      </List.Root>
    ));

    const viewport = screen.getByTestId('viewport');
    Object.defineProperties(viewport, {
      scrollHeight: { value: 1000, configurable: true },
      clientHeight: { value: 200, configurable: true },
      scrollTop: { value: 750, configurable: true },
    });
    testSource.setHasMore(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(testSource.loadMore).toHaveBeenCalledTimes(1);
  });
});
