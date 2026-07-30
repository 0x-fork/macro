import { describe, expect, it, vi } from 'vitest';

vi.mock('@core/constant/featureFlags', () => ({
  ENABLE_NEW_INBOX: () => false,
  ENABLE_SNIPPETS: () => true,
  ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_OVERRIDE: false,
}));

import {
  compileToAst,
  NIL_UUID,
  queryStateFrom,
} from '@app/features/next-soup/filters/filter-store';
import { getViewPreset } from '../sidebar/soup-filter-presets';
import { withInboxReadFilter } from './inbox-read-filter';

const defaultTabState = () =>
  queryStateFrom(getViewPreset('inbox', 'default')!.filters);

describe('withInboxReadFilter', () => {
  it('keeps Default tab docs and chats unfiltered under unread', () => {
    const ast = compileToAst(
      withInboxReadFilter(defaultTabState(), {
        filter: 'unread',
        tab: 'default',
      })
    );

    // The seen filter is an EXISTS over notifications server-side; the tab's
    // own activity carries no notifications for the acting user (self-created
    // docs/agents have none, sending a message notifies everyone BUT the
    // sender), so injecting seen filters here would silently exclude the
    // whole "my activity" half.
    expect(ast.df).toEqual({ '!': { l: { id: NIL_UUID } } });
    expect(ast.cf).toEqual({ '!': { l: { cid: NIL_UUID } } });
    expect(ast.chanf).toEqual({ l: { IsParticipant: true } });

    // The signal half still narrows to unseen items.
    expect(JSON.stringify(ast.ef)).toContain('"NotificationSeen":false');
  });

  it('still narrows docs, chats, and channels on other inbox tabs', () => {
    const ast = compileToAst(
      withInboxReadFilter(defaultTabState(), {
        filter: 'unread',
        tab: 'signal',
      })
    );

    expect(JSON.stringify(ast.df)).toContain('"ns":false');
    expect(JSON.stringify(ast.cf)).toContain('"ns":false');
    expect(JSON.stringify(ast.chanf)).toContain('"NotificationSeen":false');
  });

  it("leaves the query untouched for 'all'", () => {
    const state = defaultTabState();
    expect(withInboxReadFilter(state, { filter: 'all', tab: 'default' })).toBe(
      state
    );
  });
});
