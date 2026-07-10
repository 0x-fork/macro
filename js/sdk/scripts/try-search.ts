// Tiny smoke test: search channels by name and print the first hits.
//   MACRO_TOKEN=eyJ... bun scripts/try-search.ts <query>
// Get a token from the logged-in dev web app: devtools → Network → any API
// request → copy the `Authorization: Bearer ...` value (it's the short-lived
// JWT from auth-service /jwt/macro_api_token).

import { Macro } from '../src/macro';

const token = process.env.MACRO_TOKEN;
if (!token) throw new Error('set MACRO_TOKEN (see comment at top of file)');

const query = process.argv[2];
const macro = new Macro({ token, env: 'dev' });

let count = 0;
for await (const channel of macro.channels.search(query)) {
  console.log(channel.id, await channel.name());
  if (++count >= 5) break;
}
if (count === 0) console.log(`no channels matched '${query}'`);
