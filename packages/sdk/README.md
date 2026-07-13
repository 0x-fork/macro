The Macro SDK, which is a library for interacting with Macro's backend services

- **`generated/`**: generated Typescript types and a HeyAPI client from Macro's
  OpenAPI specs.
- **`src/`**: a hand-written ergonomic SDK layer that provides an "orm"-y API.

## Coverage checking

We have a coverage checker. It reads every generated function and ensures that
every client function that is generated is called by some hand-written function
in `src/`. If a generated function is not called, the coverage checker will fail
the build.

You can add exceptions for stuff openapi covers that we don't want the sdk to
support by adding them to the `src/coverage/skipped.ts`. You can implement
support by adding a wrapper to the appropriate model. There is CI to ensure that
we don't forget to add coverage or explicitly skip coverage for new generated
functions (endpoints).

## Webhook events

Event names and payloads are **generated from the backend**: the Rust webhook
crate exposes a `WebhookEvent` union in the storage OpenAPI spec, and
`src/events/types.ts` derives `EventName` / `EventPayload` from it.
