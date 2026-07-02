//! HTTP/2 contention benchmark.
//!
//! Spins up an axum server (served the same way as our production services)
//! on a dedicated multi-threaded runtime, and drives it with reqwest HTTP/2
//! clients from a second multi-threaded runtime. Reports requests/sec,
//! throughput, and latency percentiles per scenario.
//!
//! Environment knobs:
//! - `H2_BENCH_MEASURE_MS`: measured duration per scenario (default 2000).
//! - `H2_BENCH_WARMUP_MS`: warmup per scenario (default 300).
//! - `H2_BENCH_SERVER_THREADS` / `H2_BENCH_CLIENT_THREADS`: runtime sizes
//!   (default: half the available cores each, min 2).
//! - `H2_BENCH_FILTER`: substring filter on scenario names.
//! - `H2_BENCH_JSON`: path to write JSON-lines results (for diffing runs).
//! - `H2_BENCH_TARGET`: `host:port` of an external benchmark server
//!   (`h2_bench_server`). When set, no in-process server is spawned, letting
//!   you pair different h2 versions on the client and server sides.
//!
//! For a quick CI-friendly run:
//! `H2_BENCH_MEASURE_MS=500 cargo bench -p h2_bench`

use std::time::Duration;

use h2_bench::{
    BenchServer, SIZE_1K, SIZE_1M, SIZE_8K, SIZE_64K, Scenario, Workload, run_scenario,
};

fn env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

const SCENARIOS: &[Scenario] = &[
    // Single connection, increasing multiplexed stream counts. This is the
    // shape of service-to-service traffic over a shared connection, and the
    // main case PR hyperium/h2#917 targets.
    Scenario {
        name: "dl_1k_c1x1",
        workload: Workload::Download(SIZE_1K),
        connections: 1,
        concurrency: 1,
    },
    Scenario {
        name: "dl_1k_c1x8",
        workload: Workload::Download(SIZE_1K),
        connections: 1,
        concurrency: 8,
    },
    Scenario {
        name: "dl_1k_c1x64",
        workload: Workload::Download(SIZE_1K),
        connections: 1,
        concurrency: 64,
    },
    Scenario {
        name: "dl_1k_c1x256",
        workload: Workload::Download(SIZE_1K),
        connections: 1,
        concurrency: 256,
    },
    // Larger response bodies: more DATA frames per request, more flow
    // control work.
    Scenario {
        name: "dl_64k_c1x8",
        workload: Workload::Download(SIZE_64K),
        connections: 1,
        concurrency: 8,
    },
    Scenario {
        name: "dl_64k_c1x64",
        workload: Workload::Download(SIZE_64K),
        connections: 1,
        concurrency: 64,
    },
    Scenario {
        name: "dl_1m_c1x8",
        workload: Workload::Download(SIZE_1M),
        connections: 1,
        concurrency: 8,
    },
    // Upload + download (request bodies exercise the send path / poll_capacity).
    Scenario {
        name: "echo_8k_c1x8",
        workload: Workload::Echo(SIZE_8K),
        connections: 1,
        concurrency: 8,
    },
    Scenario {
        name: "echo_8k_c1x64",
        workload: Workload::Echo(SIZE_8K),
        connections: 1,
        concurrency: 64,
    },
    // Multiple connections: closer to a fleet of clients hitting one server.
    Scenario {
        name: "dl_1k_c4x64",
        workload: Workload::Download(SIZE_1K),
        connections: 4,
        concurrency: 64,
    },
    Scenario {
        name: "dl_1k_c4x256",
        workload: Workload::Download(SIZE_1K),
        connections: 4,
        concurrency: 256,
    },
    Scenario {
        name: "echo_8k_c4x64",
        workload: Workload::Echo(SIZE_8K),
        connections: 4,
        concurrency: 64,
    },
];

fn main() -> anyhow::Result<()> {
    // `cargo bench` passes --bench; ignore unknown args so this plays nice.
    let default_threads = std::thread::available_parallelism()
        .map(|parallelism| (parallelism.get() / 2).max(2))
        .unwrap_or(2);
    let server_threads = env_usize("H2_BENCH_SERVER_THREADS", default_threads);
    let client_threads = env_usize("H2_BENCH_CLIENT_THREADS", default_threads);
    let warmup = Duration::from_millis(env_usize("H2_BENCH_WARMUP_MS", 300) as u64);
    let measure = Duration::from_millis(env_usize("H2_BENCH_MEASURE_MS", 2000) as u64);
    let filter = std::env::var("H2_BENCH_FILTER").unwrap_or_default();
    let json_path = std::env::var("H2_BENCH_JSON").ok();

    let target: Option<std::net::SocketAddr> = std::env::var("H2_BENCH_TARGET")
        .ok()
        .map(|target| target.parse())
        .transpose()?;
    let server = match target {
        Some(_) => None,
        None => Some(BenchServer::spawn(server_threads)?),
    };
    let addr = target.unwrap_or_else(|| server.as_ref().expect("server").addr);
    let client_runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(client_threads)
        .thread_name("h2-bench-client")
        .enable_all()
        .build()?;

    println!(
        "h2_contention bench: server_threads={server_threads} client_threads={client_threads} \
         warmup={warmup:?} measure={measure:?}"
    );
    println!(
        "{:<16} {:>5} {:>6} {:>10} {:>10} {:>9} {:>9} {:>9} {:>9}",
        "scenario", "conns", "conc", "req/s", "MB/s", "p50(us)", "p90(us)", "p99(us)", "max(us)"
    );

    let mut json_lines = Vec::new();
    for scenario in SCENARIOS {
        if !filter.is_empty() && !scenario.name.contains(&filter) {
            continue;
        }
        let result = client_runtime.block_on(run_scenario(addr, *scenario, warmup, measure))?;
        println!(
            "{:<16} {:>5} {:>6} {:>10.0} {:>10.2} {:>9} {:>9} {:>9} {:>9}",
            result.name,
            result.connections,
            result.concurrency,
            result.rps,
            result.throughput_mb_s,
            result.p50_us,
            result.p90_us,
            result.p99_us,
            result.max_us,
        );
        json_lines.push(serde_json::to_string(&result)?);
    }

    if let Some(path) = json_path {
        std::fs::write(&path, json_lines.join("\n") + "\n")?;
        println!("wrote JSON results to {path}");
    }

    Ok(())
}
