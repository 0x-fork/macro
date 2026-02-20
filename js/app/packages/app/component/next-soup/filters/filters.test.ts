import { describe, expect, it } from 'vitest';
import type { SoupItemsQueryFilters } from '@queries/soup/items';
import { composeBackendSoupFilters, NIL_UUID } from './backend-query-filters';
import {
  applyInboxQueryFilters,
  removeInboxQueryFilters,
} from './inbox-query-filters';

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

describe('inbox query filter helpers', () => {
  it('applyInboxQueryFilters merges inbox flags without overwriting recipients or seen filters', () => {
    const base: SoupItemsQueryFilters = {
      channel_filters: {
        notification_filters: {
          seen: false,
        },
      },
      chat_filters: {
        notification_filters: {
          seen: false,
        },
      },
      document_filters: {
        notification_filters: {
          seen: false,
        },
      },
      email_filters: {
        recipients: [NIL_UUID],
      },
    };

    const applied = applyInboxQueryFilters(base);

    expect(applied.channel_filters?.notification_filters).toEqual({
      seen: false,
      done: false,
    });
    expect(applied.chat_filters?.notification_filters).toEqual({
      seen: false,
      done: false,
    });
    expect(applied.document_filters?.notification_filters).toEqual({
      seen: false,
      done: false,
    });
    expect(applied.document_filters?.task_filters).toEqual({
      include_cbm_atm_nc: true,
    });
    expect(applied.email_filters?.recipients).toEqual([NIL_UUID]);
    expect(applied.email_filters?.importance).toBe(true);
  });

  it('removeInboxQueryFilters removes only inbox-specific fields and preserves others', () => {
    const base: SoupItemsQueryFilters = {
      channel_filters: {
        notification_filters: {
          done: false,
          seen: false,
        },
      },
      chat_filters: {
        notification_filters: {
          done: false,
          seen: false,
        },
      },
      document_filters: {
        notification_filters: {
          done: false,
          seen: false,
        },
        task_filters: {
          include_cbm_atm_nc: true,
        },
      },
      email_filters: {
        recipients: [NIL_UUID],
        importance: true,
      },
    };

    const removed = removeInboxQueryFilters(base);

    expect(removed.channel_filters?.notification_filters).toEqual({
      seen: false,
    });
    expect(removed.chat_filters?.notification_filters).toEqual({
      seen: false,
    });
    expect(removed.document_filters?.notification_filters).toEqual({
      seen: false,
    });
    expect(removed.document_filters?.task_filters).toBeUndefined();
    expect(removed.email_filters).toEqual({
      recipients: [NIL_UUID],
    });
  });

  it('removeInboxQueryFilters keeps non-inbox importance values', () => {
    const base: SoupItemsQueryFilters = {
      email_filters: {
        importance: false,
      },
    };

    const removed = removeInboxQueryFilters(base);

    expect(removed.email_filters?.importance).toBe(false);
  });

  it('removeInboxQueryFilters keeps non-inbox done/task values', () => {
    const base: SoupItemsQueryFilters = {
      channel_filters: {
        notification_filters: {
          done: true,
        },
      },
      document_filters: {
        task_filters: {
          include_cbm_atm_nc: false,
        },
      },
    };

    const removed = removeInboxQueryFilters(base);

    expect(removed.channel_filters?.notification_filters?.done).toBe(true);
    expect(removed.document_filters?.task_filters?.include_cbm_atm_nc).toBe(
      false
    );
  });
});
