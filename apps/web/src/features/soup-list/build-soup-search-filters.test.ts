import { PROPERTY_OPTION_IDS, SYSTEM_PROPERTY_IDS } from '@property/constants';
import { describe, expect, it } from 'vitest';
import { buildSearchEntityFilters } from './build-soup-search-filters';
import { NIL_UUID } from './facet-store';
import { NO_ASSIGNEE } from './facets/base';

describe('buildSearchEntityFilters', () => {
  it('confines an untyped search away from unsupported targets', () => {
    expect(buildSearchEntityFilters({})).toMatchObject({
      channel_thread_filters: { thread_ids: [NIL_UUID] },
      foreign_entity_filters: { ids: [NIL_UUID] },
    });
  });

  it('preserves an explicit empty email-account facet as NIL', () => {
    expect(
      buildSearchEntityFilters({ 'email-inbox': [NIL_UUID] }).email_filters
    ).toEqual({ link_ids: [NIL_UUID] });
  });

  it('maps task facets and omits the client-only unassigned sentinel', () => {
    const filters = buildSearchEntityFilters({
      'search-type': ['task'],
      'task-status': ['task-not-started'],
      'task-priority': ['task-urgent'],
      assignee: [NO_ASSIGNEE, 'user-1'],
    });

    expect(filters.document_filters?.sub_types).toEqual(['task']);
    expect(filters.property_filters).toEqual([
      {
        property_definition_id: SYSTEM_PROPERTY_IDS.STATUS,
        option_ids: [PROPERTY_OPTION_IDS.STATUS.NOT_STARTED],
      },
      {
        property_definition_id: SYSTEM_PROPERTY_IDS.PRIORITY,
        option_ids: [PROPERTY_OPTION_IDS.PRIORITY.URGENT],
      },
      {
        property_definition_id: SYSTEM_PROPERTY_IDS.ASSIGNEES,
        entity_ids: ['user-1'],
      },
    ]);
  });

  it('maps view scopes and tab facets into Search service filters', () => {
    const mail = buildSearchEntityFilters({
      scope: ['email'],
      mail: ['important'],
    });
    expect(mail.email_filters?.importance).toBe(true);
    expect(mail.document_filters?.document_ids).toEqual([NIL_UUID]);

    const calls = buildSearchEntityFilters({
      scope: ['calls'],
      calls: ['missed'],
    });
    expect(calls.call_filters?.status).toBe('MISSED');
    expect(calls.email_filters?.email_thread_ids).toEqual([NIL_UUID]);

    const documents = buildSearchEntityFilters({
      scope: ['document-or-file'],
      type: ['file-pdf'],
    });
    expect(documents.document_filters?.file_types).toEqual(['pdf']);

    const task = buildSearchEntityFilters({ scope: ['task'] });
    expect(task.document_filters?.sub_types).toEqual(['task']);
    expect(task.email_filters?.email_thread_ids).toEqual([NIL_UUID]);

    const channels = buildSearchEntityFilters({
      scope: ['teams'],
      channels: ['teams'],
    });
    expect(channels.channel_filters?.channel_types).toEqual([
      'public',
      'private',
    ]);

    const folders = buildSearchEntityFilters({ scope: ['folders'] });
    expect(folders.project_filters?.project_ids).toBeUndefined();
    expect(folders.chat_filters?.chat_ids).toEqual([NIL_UUID]);

    const agents = buildSearchEntityFilters(
      { scope: ['agent'], agents: ['owned'] },
      { userId: 'user-1' }
    );
    expect(agents.chat_filters?.chat_ids).toBeUndefined();
    expect(agents.chat_filters?.owners).toEqual(['user-1']);
    expect(agents.project_filters?.project_ids).toEqual([NIL_UUID]);

    const crm = buildSearchEntityFilters({
      scope: ['crm-company-active'],
    });
    expect(crm.document_filters?.document_ids).toEqual([NIL_UUID]);
    expect(crm.call_filters?.call_ids).toEqual([NIL_UUID]);

    const assignedTasks = buildSearchEntityFilters(
      { scope: ['task'], tasks: ['assigned-to-me'] },
      { userId: 'user-1' }
    );
    expect(assignedTasks.property_filters).toContainEqual({
      property_definition_id: SYSTEM_PROPERTY_IDS.ASSIGNEES,
      entity_ids: ['user-1'],
    });
  });

  it('maps runtime thread, read, and call facets without view knowledge', () => {
    const filters = buildSearchEntityFilters({
      'channel-thread-scope': ['user-1'],
      'read-state': ['unread'],
      'call-status': ['MISSED'],
    });

    expect(filters.channel_thread_filters).toEqual({
      participant_ids: ['user-1'],
    });
    expect(filters.call_filters?.status).toBe('MISSED');
    expect(filters.document_filters?.notification_filters).toEqual({
      seen: false,
    });
    expect(filters.email_filters?.notification_filters).toEqual({
      seen: false,
    });
  });
});
