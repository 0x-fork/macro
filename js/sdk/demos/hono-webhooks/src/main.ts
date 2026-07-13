import { Macro } from '@macro/sdk';
import { Hono } from 'hono';

const macro = new Macro({
  token: process.env.MACRO_API_KEY ?? '',
  webhookSecret: process.env.MACRO_WEBHOOK_SECRET ?? '',
});

if (!macro.events) throw new Error('Set MACRO_WEBHOOK_SECRET to enable events');

macro.events.on('channel.message_posted', async ({ metadata, message }) => {
  const text = await message.content();
  console.log(`[message_posted] channel=${metadata.channel_id} text="${text}"`);
});

macro.events.on('document.created', ({ metadata }) => {
  console.log(`[document.created] id=${metadata.document_id}`);
});

const app = new Hono();
app.post('/webhook', (c) => macro.events!.webhook()(c.req.raw));

export default { port: 3000, fetch: app.fetch };
console.log('Listening on http://localhost:3000 — POST /webhook');
