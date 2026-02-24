import { sidebarPinnedItems } from '@core/signal/layout/globalSidebar';
import type { EntityData, WithNotification } from '@entity';
import { notDoneFilter } from '@app/component/next-soup/filters/filters';
import { signalFilter } from '@app/component/next-soup/filters/signal-filters';
import { useSoupItemsQuery } from '@queries/soup/items';
import { createMemo } from 'solid-js';
import { composeSidebarItems } from './compose-sidebar-items';

const withDefaultNotifications = (
  entity: EntityData
): WithNotification<EntityData> => ({
  ...entity,
  notifications: () => [],
});

export function useGlobalSidebarItems() {
  const itemsQuery = useSoupItemsQuery(() => ({
    params: {
      limit: 100,
      sort_method: 'updated_at',
    },
    body: {
      emailView: 'all',
      channel_filters: {},
      chat_filters: {},
      document_filters: {},
      email_filters: {},
      project_filters: {},
    },
  }));

  const entities = createMemo(() =>
    (itemsQuery.data ?? []).map(withDefaultNotifications)
  );
  // LHS now mirrors the inbox feed semantics.
  const filteredEntities = createMemo(() =>
    entities().filter(
      (entity) =>
        signalFilter(entity) && notDoneFilter(entity)
    )
  );
  const filteredPinned = createMemo(() =>
    sidebarPinnedItems().filter((item) => item.kind === 'entity')
  );

  const pinnedItems = createMemo(() => {
    return composeSidebarItems({
      pinned: filteredPinned(),
      entities: filteredEntities(),
    }).pinnedItems;
  });

  const frecencyItems = createMemo(() =>
    composeSidebarItems({
      pinned: filteredPinned(),
      entities: filteredEntities(),
    }).frecencyItems
  );

  const channelItems = createMemo(() =>
    entities().filter((entity) => entity.type === 'channel')
  );

  return {
    pinnedItems,
    frecencyItems,
    channelItems,
    isLoading: () => itemsQuery.isLoading,
  };
}
