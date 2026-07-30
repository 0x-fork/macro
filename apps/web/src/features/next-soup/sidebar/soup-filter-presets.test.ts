import { describe, expect, it, vi } from 'vitest';

vi.mock('@core/constant/featureFlags', () => ({
  ENABLE_NEW_INBOX: () => false,
  ENABLE_SNIPPETS: () => true,
  ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_OVERRIDE: false,
}));

import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { compileToAst, queryStateFrom } from '../filters/filter-store';
import { getViewPreset, VIEW_TAB_PRESETS } from './soup-filter-presets';

const mailTabs = Object.keys(VIEW_TAB_PRESETS.mail.tabs);

describe('mail view presets', () => {
  it('groups every mail tab by date independently of the new inbox flag', () => {
    for (const tab of mailTabs) {
      expect(getViewPreset('mail', tab)?.groupBy).toBe('date');
    }
  });
});

describe('task view presets', () => {
  const context = { userId: 'user-1', isTeamAdmin: false };

  it('uses one My tasks tab for tasks owned by or assigned to the user', () => {
    const preset = getViewPreset('tasks', 'my-tasks', context);

    expect(VIEW_TAB_PRESETS.tasks.default).toBe('my-tasks');
    expect(Object.keys(VIEW_TAB_PRESETS.tasks.tabs)).toEqual([
      'my-tasks',
      'all',
    ]);
    expect(preset?.clientFilters).toEqual({
      and: ['task', 'my-tasks'],
      or: ['task-not-started', 'task-in-progress', 'task-in-review'],
    });
    expect(preset?.groupBy).toBe(`property:${SYSTEM_PROPERTY_IDS.PRIORITY}`);
    expect(compileToAst(queryStateFrom(preset?.filters ?? {})).df).toEqual({
      '&': [
        { l: { dst: 'task' } },
        {
          '|': [{ l: { o: 'user-1' } }, { l: { imp: true } }],
        },
      ],
    });
  });
});
