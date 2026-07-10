import { Macro } from './macro';
import { here, msg } from './mentions';

const macro = new Macro({ token: 'mk_live_...', env: 'dev' });

const channel = macro.channels.byId('ch_abc');
const doc = macro.documents.byId('doc_runbook');
const alice = macro.users.byId('u_alice');

const posted = await channel.send(msg`kicking off — see ${doc}. cc ${here}`);
await posted.react('rocket');

const reply = await posted.reply(msg`thanks ${alice}`);
await reply.edit('thanks!');

for await (const m of channel.messages({ pageSize: 50 })) {
  if ((await m.content()).includes('done')) {
    await m.react('white_check_mark');
    break;
  }
}

for await (const incident of macro.channels.search('incident')) {
  await incident.send('following up');
  break;
}

const dm = await alice.dm();
await dm.send(msg`ping ${alice}`);
