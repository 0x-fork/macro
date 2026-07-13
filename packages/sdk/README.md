The Macro SDK — a thin, namespaced TypeScript client for Macro's backend services.

- **`generated/`**: TypeScript types and a `@hey-api/openapi-ts` fetch client per
  service, generated from Macro's OpenAPI specs. Treat as build output — never
  hand-edit; regenerate with `just update-generated` (or `bun run generate` from
  synced specs).
- **`src/`**: a small hand-written layer over `generated/`:
  - `client.ts` — `MacroClient`, one authenticated hey-api `Sdk` per service.
  - `config.ts` — hosts per environment and `MacroOpts`.
  - `events.ts` — `MacroEvents` webhook receiver (verify + dispatch).
  - `index.ts` — the package entrypoint.

## Usage

```ts
import { MacroClient } from '@macro/sdk';

const sdk = new MacroClient({ token: '…', env: 'prod' });
const task = await sdk.storage.createTaskHandler({ body: { taskName: 'Hi' } });
sdk.events?.on('document.created', ({ metadata }) => console.log(metadata.document_id));
```

Each `sdk.<service>` is the raw hey-api `Sdk` — call the generated operations
directly with `{ path, query, body }`.

## Webhook events

Event names and payloads are **generated from the backend**: the Rust webhook
crate exposes a `WebhookEvent` union in the storage OpenAPI spec, and
`src/events.ts` derives `EventName` / `EventPayload` from it.

## Demos

`demos/` holds standalone example apps (`file:../..` on `@macro/sdk`). See each
demo's README.
