import { describe, expect, it, vi } from 'vitest';

vi.mock('@core/constant/featureFlags', () => ({
  ENABLE_NEW_INBOX: () => false,
  ENABLE_SNIPPETS: () => true,
  ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_OVERRIDE: false,
}));

import { NIL_UUID } from '@app/features/next-soup/filters/filter-store';
import { getViewPreset, VIEW_TAB_PRESETS } from './soup-filter-presets';

const mailTabs = Object.keys(VIEW_TAB_PRESETS.mail.tabs);

describe('mail view presets', () => {
  it('groups every mail tab by date independently of the new inbox flag', () => {
    for (const tab of mailTabs) {
      expect(getViewPreset('mail', tab)?.groupBy).toBe('date');
    }
  });
});

describe('search view preset', () => {
  // Channel threads render as an unnamed fallback row, so search excludes them
  // server-side. `search-supported` is the client-side mirror that keeps rows
  // arriving outside the query (websocket inserts, another view's placeholder
  // rows) out of the feed — dropping either half brings the bad rows back.
  it('excludes channel threads server-side and mirrors it client-side', () => {
    const preset = getViewPreset('search');

    expect(preset?.filters?.include?.channelThreadId).toEqual([NIL_UUID]);
    expect(preset?.clientFilters?.and).toContain('search-supported');
  });
});
