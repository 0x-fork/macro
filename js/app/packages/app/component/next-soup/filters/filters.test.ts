import { describe, expect, it } from 'vitest';
import type { SoupItemsQueryFilters } from '@queries/soup/items';
import { composeBackendSoupFilters, NIL_UUID } from './backend-query-filters';

describe('composeBackendSoupFilters', () => {
  const defaultFilters: SoupItemsQueryFilters = {};

  const peopleFilters: SoupItemsQueryFilters = {
    document_filters: {
      document_ids: [NIL_UUID],
    },
    channel_filters: {
      channel_types: ['direct_message'],
    },
  };

  it('applies done=false notification filters and task bypass in inbox/not-done mode', () => {
    const filters = composeBackendSoupFilters(defaultFilters, {
      inboxActive: true,
      notDoneActive: true,
      unreadActive: false,
    });

    expect(filters.document_filters?.notification_filters).toEqual({
      done: false,
    });
    expect(filters.chat_filters?.notification_filters).toEqual({
      done: false,
    });
    expect(filters.project_filters?.notification_filters).toEqual({
      done: false,
    });
    expect(filters.channel_filters?.notification_filters).toEqual({
      done: false,
    });
    expect(filters.document_filters?.task_filters).toEqual({
      include_cbm_atm_nc: true,
    });
  });

  it('does not apply task bypass when documents are excluded by entity type filter', () => {
    const filters = composeBackendSoupFilters(peopleFilters, {
      inboxActive: true,
      notDoneActive: true,
      unreadActive: false,
    });

    expect(filters.document_filters?.document_ids).toEqual([NIL_UUID]);
    expect(filters.document_filters?.task_filters).toBeUndefined();
    expect(filters.channel_filters?.channel_types).toEqual(
      peopleFilters.channel_filters?.channel_types
    );
  });

  it('applies seen=false notification filters in unread mode', () => {
    const filters = composeBackendSoupFilters(defaultFilters, {
      inboxActive: false,
      notDoneActive: false,
      unreadActive: true,
    });

    expect(filters.document_filters?.notification_filters).toEqual({
      seen: false,
    });
    expect(filters.chat_filters?.notification_filters).toEqual({
      seen: false,
    });
    expect(filters.project_filters?.notification_filters).toEqual({
      seen: false,
    });
    expect(filters.channel_filters?.notification_filters).toEqual({
      seen: false,
    });
    expect(filters.document_filters?.task_filters).toBeUndefined();
  });
});
