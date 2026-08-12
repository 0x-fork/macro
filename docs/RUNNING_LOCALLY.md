# Running Locally

Use `just run_local` to run the full app on your machine.

```bash
just run_local
```

This starts local infra, backend services, the local proxy, and the frontend.
When startup finishes, the command prints the frontend URL and the important
service URLs.

## Requirements

The easiest path is to use the repo's Nix shell. It should provide the Rust
toolchain, `cargo-zigbuild`, Zig, Bun, sqlx, and the other project tools.

Outside the Nix shell, you need at least:

- Docker with Compose v2
- Doppler CLI
- Rust toolchain
- `cargo-zigbuild` and Zig
- Bun
- sqlx CLI

You should also be logged in to Doppler and have access to the `local` project:

```bash
doppler login
```

`run_local` pulls the `lcl_personal` Doppler config by default. If you want to
run without Doppler, use:

```bash
just run_local --no-doppler --env-file ./local.env
```

## Running One Stack

Start the default stack:

```bash
just run_local
```

Useful preflight:

```bash
just doctor-local
```

While `run_local` is attached:

- Press `r` to rebuild and reload changed Rust services.
- Press `q` to tear the stack down and exit.

Prefer `q` over just closing the terminal. It stops/removes the instance's
containers immediately, so the next startup does not have to clean up a stale
stack first.

## Running Multiple Instances

Use named instances when you want multiple local stacks at once, especially
across worktrees:

```bash
just run_local --instance agent-a
just run_local --instance agent-b
```

Each named instance gets its own Compose project, volumes, networks, generated
env files, proxy, frontend port, and backend ports. Ports are deterministic for
the instance name, so the same name should get the same port window on every
run.

If a generated port window conflicts with something else on your machine:

```bash
just run_local --instance agent-a --port-base 23000
```

Generated files live at:

```text
infra/local/generated/<instance>
```

## What Gets Rebuilt

Rust backend services are built on the host with `cargo zigbuild` and mounted
into a shared runtime image. Docker is not compiling those Rust services during
normal `run_local`.

Pressing `r` rebuilds the Rust binaries and restarts only the services whose
binaries changed.

The current rough edge is auxiliary Docker-built services:

- `sync_service`
- `lexical_service`
- `websocket_service`

Those are not rebuilt by default. If you change sync-service, lexical-service,
or anything that affects their Docker images, the running stack can keep using a
stale image.

To force those services to rebuild:

```bash
just run_local --build-aux-services
```

When the stack was started with `--build-aux-services`, pressing `r` also
rebuilds those auxiliary images and recreates their containers. That is slower,
so leave it off unless you are actively working on those services or need to
pick up a change there.

If you already started without `--build-aux-services` and suspect a stale
sync/lexical image, press `q` and restart with the flag.

## Headless Mode (previews, agents, CI)

`just stack` is the same stack without a terminal attached: no hotkey loop, no
dev server. The frontend is built once (a dev-mode bundle with production
optimizations) and served statically by the instance's Caddy proxy, so the whole
product lives behind **one origin** and a finished `up` leaves only Docker
containers running — nothing to babysit.

```bash
just stack up                  # bring everything up, print URLs, return
just stack status --json      # machine-readable state (containers, health, URLs)
just stack update             # rebuild + reload only changed services (the `r` hotkey)
just stack update --frontend  # also rebuild the frontend bundle
just stack down               # containers + volumes + state
```

All the `run_local` flags apply (`--instance`, `--no-doppler --env-file`,
`--no-build`, `--binaries-dir`); CI can hand in a prebuilt bundle with
`--frontend-dist`, and `--infra-only` stops after the infra bring-up + init
(the CI bake mode — without Doppler the app services have no env to boot
with, and the snapshot only captures infra volumes). The app is served at `<proxy>/app/` — the bundle resolves its
backend from the origin it is served on, so the same stack works on localhost
or behind a preview hostname without a rebuild.

`stack up` also caches the expensive infra init. The first cold run migrates
the DB, waits out the FusionAuth kickstart, and creates the search indices,
then saves those volumes as a content-addressed **init snapshot** (keyed by the
migrations, kickstart, index mappings, image pins, and container platform —
stored under `infra/local/generated/.snapshots`). Later runs whose inputs match restore the
snapshot and skip the init entirely; any input change is a cache miss and a
normal full init. `just stack snapshot` shows the current key; `--no-snapshot`
opts out. This is also what makes Fly previews boot fast — CI bakes the
snapshot into the preview image (see `infra/preview/README.md`).

## Common Commands

Run local binaries against shared dev resources instead of a fully local stack:

```bash
just run_dev
```

See what a running (or stopped) instance looks like — endpoints with live
reachability probes plus every container's state and host ports — without
starting or rebuilding anything:

```bash
just status_local
```

Stop an instance but keep its volumes:

```bash
just stop_local --instance agent-a
```

Remove an instance's containers, volumes, and named-instance networks:

```bash
just destroy_local --instance agent-a
```

Drop, recreate, and migrate an instance database:

```bash
just reset_local --instance agent-a
```

For the default instance, omit `--instance`.

## Real Google Calendar Push (`calendar-push`)

By default a local stack only notices provider-side calendar edits on its
5-minute poll. Calendar push closes that gap to seconds by relaying Google's
`events.watch` webhook deliveries through the dev deployment: Google requires
a watch channel's address to be public HTTPS on a domain verified in the
Cloud project owning the OAuth client, which a laptop can never satisfy, so
local channels open against dev's already-verified webhook address with a
per-instance token, and the local pubsub workers subscribe OUT to dev's relay
(SSE) for deliveries addressed to that token. No tunnel, no DNS, no inbound
connectivity to your machine.

```bash
just calendar-push enable --instance agent-a   # or omit --instance
just run_local --instance agent-a              # (re)start to apply
```

`enable` writes `infra/local/generated/<instance>/calendar-push.env`, which
every env resolve overlays automatically. It requires
`CALENDAR_WATCH_RELAY_SECRET`, pulled with the rest of the Doppler
`local/lcl_personal` config (or supplied via `--env-file`); the resolve warns
if it is missing.

To verify: connect a Google account, then edit an event in the Google
Calendar UI — the local projection should update within seconds. The pubsub
workers log `subscribing to relayed calendar watch notifications` on start
and `relayed watch channel handshake received` when a channel opens.

Turning it off:

```bash
just calendar-push disable --instance agent-a
```

A running stack keeps push until it restarts. On graceful shutdown (stop,
destroy, restart) the stack calls `channels.stop` at Google for every open
channel; anything that slips through lapses at its natural expiry, and dev
rejects those strays centrally, so they never reach your machine.

The no-Google fake path still works for plumbing checks: stamp
`watch_channel_id`/`watch_resource_id` on a `calendars` row, then POST to the
local webhook directly:

```bash
curl -i -X POST http://localhost:<email_service port>/calendar/notifications \
  -H "x-goog-channel-token: <CALENDAR_WATCH_TOKEN>" \
  -H "x-goog-channel-id: <stamped channel id>" \
  -H "x-goog-resource-id: <stamped resource id>" \
  -H "x-goog-resource-state: exists"
```
