# hono-webhooks

Minimal demo: receive Macro webhooks in a [Hono](https://hono.dev) server.

## Setup

```bash
bun install
```

Set env vars (or add to `.env`):

```
MACRO_API_KEY=your_api_key
MACRO_WEBHOOK_SECRET=your_signing_secret
```

## Run

```bash
bun start
```

The server listens on `http://localhost:3000`. Point your Macro webhook to `POST /webhook`.

To test locally, expose the port with e.g. `ngrok http 3000` and paste the public URL into the Macro webhook settings.
