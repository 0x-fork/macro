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
import { getViewPreset, VIEW_TAB_PRESETS } from './soup-filter-presets';

const mailTabs = Object.keys(VIEW_TAB_PRESETS.mail.tabs);

describe('mail view presets', () => {
  it('groups every mail tab by date independently of the new inbox flag', () => {
    for (const tab of mailTabs) {
      expect(getViewPreset('mail', tab)?.groupBy).toBe('date');
    }
  });
});

describe('inbox default preset', () => {
  it('is the inbox default tab and resolves without user context', () => {
    expect(VIEW_TAB_PRESETS.inbox.default).toBe('default');
    // Context-free on purpose: a ctx-dependent resolver falls back to the
    // Signal preset while the user id loads, silently narrowing the query.
    expect(getViewPreset('inbox', 'default')).toBeDefined();
  });

  it('opts every reachable doc and chat into the server query', () => {
    const preset = getViewPreset('inbox', 'default');
    const ast = compileToAst(queryStateFrom(preset!.filters));

    // Docs and chats fetch unconstrained (the my-work/inbox or-predicates
    // narrow client-side); a freshly created doc or agent must be returned
    // by refetches or it vanishes from the date-grouped feed.
    expect(ast.df).toEqual({ '!': { l: { id: NIL_UUID } } });
    expect(ast.cf).toEqual({ '!': { l: { cid: NIL_UUID } } });

    // Channels fetch for every one the user participates in — with no
    // notification condition, since sending a message notifies everyone BUT
    // the sender; the my-messages or-predicate keeps just-messaged
    // conversations (incl. DMs) in the feed.
    expect(ast.chanf).toEqual({ l: { IsParticipant: true } });

    // The signal half still scopes emails to important inbox mail.
    expect(ast.emailView).toBe('inbox');

    // Types the feed doesn't show stay excluded.
    expect(ast.callf).toEqual({ l: { CallId: NIL_UUID } });
    expect(ast.ccf).toEqual({ l: { id: NIL_UUID } });
  });

  it('narrows rows client-side with the inbox/my-work/my-messages or-predicates', () => {
    expect(getViewPreset('inbox', 'default')?.clientFilters).toEqual({
      or: ['inbox', 'my-work', 'my-messages'],
    });
  });
});
