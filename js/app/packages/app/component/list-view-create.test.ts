import { describe, expect, test } from 'vitest';
import {
  getCreateActionLabel,
  getCreateOptionLabel,
  getListViewCreateActionId,
  getListViewCreateButtonLabel,
  getListViewCreateOptions,
} from './list-view-create';

describe('getListViewCreateActionId', () => {
  test.each([
    ['agents', 'agent'],
    ['mail', 'email'],
    ['tasks', 'task'],
    ['channels', 'message'],
    ['files', 'folder'],
  ] as const)('maps %s to %s', (view, actionId) => {
    expect(getListViewCreateActionId(view)).toBe(actionId);
  });

  test('does not expose create actions for aggregate views', () => {
    expect(getListViewCreateActionId('inbox')).toBeUndefined();
    expect(getListViewCreateActionId('search')).toBeUndefined();
  });

  test.each([
    ['agents', 'New agent'],
    ['mail', 'New email'],
    ['tasks', 'New task'],
    ['channels', 'New message'],
    ['files', 'New folder'],
  ] as const)('builds the correct button label for %s', (view, label) => {
    expect(getListViewCreateButtonLabel(view)).toBe(label);
  });

  test('returns the action label for each create action', () => {
    expect(getCreateActionLabel('doc')).toBe('doc');
    expect(getCreateActionLabel('canvas')).toBe('canvas');
    expect(getCreateActionLabel('task')).toBe('task');
    expect(getCreateActionLabel('email')).toBe('email');
    expect(getCreateActionLabel('folder')).toBe('folder');
    expect(getCreateActionLabel('message')).toBe('message');
    expect(getCreateActionLabel('agent')).toBe('agent');
  });

  test('returns the option label for import', () => {
    expect(getCreateOptionLabel('import')).toBe('Import');
  });

  test('returns the full files create menu', () => {
    expect(getListViewCreateOptions('files')).toEqual([
      { id: 'doc', label: 'New doc' },
      { id: 'canvas', label: 'New canvas' },
      { id: 'folder', label: 'New folder' },
      { id: 'import', label: 'Import' },
    ]);
  });

  test('returns a single create option for non-files views', () => {
    expect(getListViewCreateOptions('tasks')).toEqual([
      { id: 'task', label: 'New task' },
    ]);
  });
});
