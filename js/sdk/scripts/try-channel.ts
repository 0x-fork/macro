// Smoke test: fetch a channel by ID and print its details.
//   MACRO_TOKEN=eyJ... bun scripts/try-channel.ts <channel-id>

import { Macro } from '../src/macro';

const token = process.env.MACRO_TOKEN;
if (!token) throw new Error('set MACRO_TOKEN (see comment at top of file)');

const id = process.argv[2];
if (!id) throw new Error('usage: bun scripts/try-channel.ts <channel-id>');

const macro = new Macro({ token, env: 'dev' });
const channel = macro.channels.byId(id);

console.log('id:  ', channel.id);
console.log('name:', await channel.name());
console.log('type:', await channel.type());
