// Debug: print raw unified search results to see what types come back.
//   MACRO_TOKEN=eyJ... bun scripts/try-search-raw.ts <query>

import { MacroClient } from '../src/utils/client';

const token = process.env.MACRO_TOKEN;
if (!token) throw new Error('set MACRO_TOKEN');

const query = process.argv[2];
if (!query) throw new Error('usage: bun scripts/try-search-raw.ts <query>');

const client = new MacroClient({ token, env: 'dev' });

const res = await client.search.unifiedSearch({
  body: {
    query,
    match_type: 'partial',
    search_on: 'name_content',
    filters: { channel_filters: {} },
  },
  query: { page_size: 20 },
});

if (res.error || !res.data) {
  console.error('error:', res.error);
  process.exit(1);
}

const { results, next_cursor } = res.data;
console.log(`${results.length} results, next_cursor: ${next_cursor ?? 'none'}`);
for (const r of results)
  console.log(' ', r.type, JSON.stringify(r).slice(0, 120));
