# h2_bench

HTTP/2 benchmark harness for measuring how changes to the [`h2`](https://github.com/hyperium/h2)
crate affect our stack. Both our axum servers and our reqwest clients sit on
top of `h2` (via hyper), so h2-internal changes (e.g. lock contention work)
directly affect service throughput and latency.

Built to evaluate [hyperium/h2#917] ("Refactor big mutex to reduce
contention"); kept around as a general regression benchmark.

[hyperium/h2#917]: https://github.com/hyperium/h2/pull/917

## What it does

- **`cargo bench -p h2_bench`** — spins up an axum server (served exactly like
  our production services: `axum::serve` on a `TcpListener`, HTTP/2 via h2c
  prior knowledge) on its own multi-threaded tokio runtime, and drives it with
  reqwest HTTP/2 clients from a second multi-threaded runtime. Scenarios sweep
  connection count, per-connection stream concurrency, and body size, and
  report req/s, MB/s, and latency percentiles.
- **`h2_bench_server` bin** — the same server standalone, for load-testing
  with an external client (e.g. `h2load` from nghttp2), which isolates the
  *server-side* h2 from the client:
  `cargo run --release -p h2_bench --bin h2_bench_server -- 8929 14`

### Knobs (env vars for the bench)

| Var | Default | Meaning |
|---|---|---|
| `H2_BENCH_MEASURE_MS` | 2000 | measured duration per scenario |
| `H2_BENCH_WARMUP_MS` | 300 | warmup per scenario (unmeasured) |
| `H2_BENCH_SERVER_THREADS` / `H2_BENCH_CLIENT_THREADS` | half the cores, min 2 | runtime sizes |
| `H2_BENCH_FILTER` | (none) | substring filter on scenario names |
| `H2_BENCH_JSON` | (none) | write JSON-lines results to this path |
| `H2_BENCH_TARGET` | (none) | `host:port` of an external `h2_bench_server`; skips the in-process server so client and server h2 versions can differ |

CI-friendly quick run: `H2_BENCH_MEASURE_MS=500 cargo bench -p h2_bench`.

### Running from a fresh clone (for upstream h2 folks)

The crate is excluded from this monorepo's dependency-unification machinery,
so it only builds its own dependencies (axum, reqwest, tokio, ...):

```bash
git clone --depth 1 --branch <branch> https://github.com/macro-inc/macro
cd macro/rust/cloud-storage

# in-process benchmark (reqwest h2 client -> axum h2 server):
cargo bench -p h2_bench

# server-side isolation with an external client (requires h2load from nghttp2):
cargo build --release -p h2_bench --bin h2_bench_server
h2_bench/scripts/run_h2load.sh target/release/h2_bench_server

# CPU-idle-dependent lost-wakeup repro (see results below):
h2_bench/scripts/warm_cold_repro.sh target/release/h2_bench_server
```

To test a specific h2 revision, add the `[patch.crates-io]` shown below to
`rust/cloud-storage/Cargo.toml`, run `cargo update -p h2@0.4.14` (or whatever
version is in the lockfile), and rebuild.

### Scripts

| Script | Purpose |
|---|---|
| `scripts/run_h2load.sh <server-bin>` | h2load sweep (connections × streams × body size) against `h2_bench_server`; isolates server-side h2 |
| `scripts/warm_cold_repro.sh <server-bin>` | demonstrates the CPU-idle-state-dependent stall: warm cores → fast, idle cores → ~24 req/s |

### Comparing h2 versions

Add a temporary patch to the workspace `Cargo.toml` (do not commit):

```toml
[patch.crates-io]
h2 = { git = "https://github.com/hyperium/h2", rev = "<rev>" }
```

then `cargo update -p h2@<version>` and re-run. The workspace also contains a
legacy `h2 0.3.x` (via old aws-smithy hyper 0.14 stack); the patch only
applies to the 0.4.x line used by hyper 1 / reqwest / axum.

