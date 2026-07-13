import { MacroClient } from '@macro/sdk';
import { Hono } from 'hono';

const sdk = new MacroClient({
  token: process.env.MACRO_API_KEY ?? '',
  webhookSecret: process.env.MACRO_WEBHOOK_SECRET ?? '',
});

if (!sdk.events) throw new Error('Set MACRO_WEBHOOK_SECRET to enable events');

sdk.events.on('channel.message_posted', ({ metadata }) => {
  console.log(`[message_posted] channel=${metadata.channel_id} message=${metadata.message_id}`);
});

sdk.events.on('document.created', ({ metadata }) => {
  console.log(`[document.created] id=${metadata.document_id}`);
});

const app = new Hono();
app.post('/webhook', (c) => sdk.events!.webhook()(c.req.raw));

export default { port: 3000, fetch: app.fetch };
console.log('Listening on http://localhost:3000 — POST /webhook');
