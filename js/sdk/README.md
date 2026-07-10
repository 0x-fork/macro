# @macro/sdk

The Macro SDK. It is split into two layers:

- **`generated/`** — the mechanical layer, produced from Macro's OpenAPI specs
  using [orval](https://orval.dev). **Do not hand-edit it**; it is overwritten
  on every regenerate. One typed `fetch` function per endpoint, plus models.
- **`src/`** — the hand-written, ergonomic SDK layer (entity classes, the
  webhook event receiver, mention builders) that imports from `generated/`.

The folder is **self-contained**: it has its own `package.json`, lockfile,
`orval.config.ts`, and `tsconfig.json`, and orval only reads specs from
`./specs`. The single bridge to the rest of the monorepo is
`scripts/sync-specs.ts`, which copies each service's `openapi.json` from
`js/app/packages/service-clients` into `./specs`.

## Layout

```
sdk/
├── package.json          # "@macro/sdk"
├── justfile              # update-generated / generate / check
├── services.ts           # the service list (shared by orval + sync-specs)
├── orval.config.ts       # one entry per service (client: 'fetch'), emits to ./generated
├── tsconfig.json         # standalone strict tsconfig
├── scripts/sync-specs.ts # copies specs in from js/app service-clients
├── specs/                # copies of each service's openapi.json (orval input)
├── generated/            # ← orval output (build artifact, do not edit)
│   └── <service>/
│       ├── client.ts     # generated fetch client (exported async fns)
│       └── schemas/      # generated TypeScript models
└── src/                  # hand-written SDK
    ├── macro.ts          # entry point: `new Macro(opts)`
    ├── entities/         # Channel / Message / Thread / User / Document handles
    ├── events/           # webhook receiver; event types come from generated/
    └── mentions.ts       # msg`` template builder
```

## Webhook events

Event names and payloads are **generated from the backend**: the Rust webhook
crate exposes a `WebhookEvent` union in the storage OpenAPI spec, and
`src/events/types.ts` derives `EventName` / `EventPayload` from it. When the
backend adds an event, regenerating here picks it up — no hand-maintained
event list.

## Regenerating

```bash
just update-generated   # full pipeline: Rust OpenAPI → specs → orval
just generate           # orval only, from the specs already in ./specs
just check              # tsc --noEmit over src + generated
```

`update-generated` runs `bun run gen-api` in `js/app` (builds the Rust
`*_openapi` binaries and refreshes the service-clients specs), then
`sync-specs` and `generate` here. CI (`sdk-check.yml`, generated from
`xtask_workflows/src/workflows/sdk_check.rs`) runs the same command and fails
if anything under `js/sdk` changes, so the generated layer can't drift from
the Rust source of truth.

Note: orval prints a non-fatal `#/info/license` schema-validation warning per
service — a cosmetic OpenAPI 3.1 quirk; generation succeeds regardless.

## Publishing

Not wired up yet. The package is `private: true`; `main`/`exports` point at
TypeScript source, which works for bun consumers but needs a build step
(dist + declarations) before publishing to npm.
