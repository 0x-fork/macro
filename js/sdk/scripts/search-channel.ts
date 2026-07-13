import { Macro } from '../src/macro';

const query = process.argv[2];
const macro = new Macro({ env: 'dev' });

let count = 0;
for await (const channel of macro.channels.search(query)) {
  console.log(channel.id, await channel.name());
  if (++count >= 5) break;
}
if (count === 0) console.log(`no channels matched '${query}'`);
