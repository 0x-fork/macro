import { NIL_UUID } from '@app/features/soup-list/facet-store';
import { describe, expect, it } from 'vitest';
import {
  encodeInboxSelection,
  inboxActiveIds,
  selectOnlyInbox,
} from '../inbox-selection';

const all = ['inbox-a', 'inbox-b'];

describe('inbox facet selection', () => {
  it('maps empty storage to all active inboxes', () => {
    expect(inboxActiveIds([], all)).toEqual(all);
  });

  it('maps NIL to an explicit empty selection', () => {
    expect(inboxActiveIds([NIL_UUID], all)).toEqual([]);
    expect(encodeInboxSelection([], all)).toEqual([NIL_UUID]);
  });

  it('collapses every selected inbox to the default', () => {
    expect(encodeInboxSelection(['inbox-b', 'inbox-a'], all)).toEqual([]);
  });

  it('keeps a subset and toggles Only back to all', () => {
    expect(encodeInboxSelection(['inbox-a'], all)).toEqual(['inbox-a']);
    expect(selectOnlyInbox('inbox-a', ['inbox-a'], all)).toEqual([]);
    expect(selectOnlyInbox('inbox-b', ['inbox-a'], all)).toEqual(['inbox-b']);
  });
});
