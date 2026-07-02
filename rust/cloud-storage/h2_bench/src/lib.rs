//! HTTP/2 benchmark harness.
//!
//! Measures throughput and latency of an axum server (served exactly like our
//! production services, via `axum::serve`) driven by a reqwest HTTP/2 client.
//! Both sides sit on top of the `h2` crate, so this benchmark is sensitive to
//! changes in `h2` internals (e.g. lock contention on multi-threaded
//! runtimes).
//!
//! Run with `cargo bench -p h2_bench`. See `benches/h2_contention.rs` for
//! environment-variable knobs.

use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use axum::Router;
use axum::extract::State;
use axum::routing::{get, post};
use bytes::Bytes;

/// Payload sizes served by the benchmark server.
pub const SIZE_1K: usize = 1024;
pub const SIZE_8K: usize = 8 * 1024;
pub const SIZE_64K: usize = 64 * 1024;
pub const SIZE_1M: usize = 1024 * 1024;

#[derive(Clone)]
struct AppState {
    payload_1k: Bytes,
    payload_64k: Bytes,
    payload_1m: Bytes,
}

fn make_payload(len: usize) -> Bytes {
    // Deterministic, non-trivially-compressible-ish payload.
    let mut buf = Vec::with_capacity(len);
    let mut x: u32 = 0x9e37_79b9;
    while buf.len() < len {
        x = x.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        buf.extend_from_slice(&x.to_le_bytes());
    }
    buf.truncate(len);
    Bytes::from(buf)
}

async fn payload_1k(State(state): State<AppState>) -> Bytes {
    state.payload_1k.clone()
}

async fn payload_64k(State(state): State<AppState>) -> Bytes {
    state.payload_64k.clone()
}

async fn payload_1m(State(state): State<AppState>) -> Bytes {
    state.payload_1m.clone()
}

async fn echo(body: Bytes) -> Bytes {
    body
}

/// Router used by both the in-process benchmark and the standalone server
/// binary.
pub fn router() -> Router {
    let state = AppState {
        payload_1k: make_payload(SIZE_1K),
        payload_64k: make_payload(SIZE_64K),
        payload_1m: make_payload(SIZE_1M),
    };
    Router::new()
        .route("/payload/1k", get(payload_1k))
        .route("/payload/64k", get(payload_64k))
        .route("/payload/1m", get(payload_1m))
        .route("/echo", post(echo))
        .with_state(state)
}

/// A benchmark server running on its own multi-threaded tokio runtime,
/// mirroring how our production services serve traffic (`axum::serve` on a
/// `TcpListener`, which negotiates HTTP/2 via prior knowledge / h2c).
pub struct BenchServer {
    pub addr: SocketAddr,
    // Kept alive for the duration of the benchmark; dropped on shutdown.
    _runtime: tokio::runtime::Runtime,
}

impl BenchServer {
    pub fn spawn(worker_threads: usize) -> anyhow::Result<Self> {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(worker_threads)
            .thread_name("h2-bench-server")
            .enable_all()
            .build()?;
        let listener = runtime.block_on(async {
            tokio::net::TcpListener::bind("127.0.0.1:0")
                .await
                .map_err(anyhow::Error::from)
        })?;
        let addr = listener.local_addr()?;
        runtime.spawn(async move {
            // Identical serving setup to our production services.
            axum::serve(listener, router().into_make_service())
                .await
                .expect("bench server failed");
        });
        Ok(Self {
            addr,
            _runtime: runtime,
        })
    }
}

/// What a single benchmark worker does in a loop.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Workload {
    /// GET a payload of the given size.
    Download(usize),
    /// POST a body of the given size and read the echo.
    Echo(usize),
}

impl Workload {
    fn path(&self) -> &'static str {
        match self {
            Workload::Download(SIZE_1K) => "/payload/1k",
            Workload::Download(SIZE_64K) => "/payload/64k",
            Workload::Download(SIZE_1M) => "/payload/1m",
            Workload::Download(_) => panic!("unsupported download size"),
            Workload::Echo(_) => "/echo",
        }
    }
}

/// A benchmark scenario.
#[derive(Clone, Copy, Debug)]
pub struct Scenario {
    pub name: &'static str,
    pub workload: Workload,
    /// Number of HTTP/2 connections (one reqwest client per connection).
    pub connections: usize,
    /// Total number of concurrent in-flight requests, split across
    /// connections.
    pub concurrency: usize,
}

/// Results of one scenario run.
#[derive(Debug, serde::Serialize)]
pub struct ScenarioResult {
    pub name: String,
    pub connections: usize,
    pub concurrency: usize,
    pub duration_secs: f64,
    pub requests: u64,
    pub rps: f64,
    pub throughput_mb_s: f64,
    pub p50_us: u64,
    pub p90_us: u64,
    pub p99_us: u64,
    pub max_us: u64,
}

fn percentile(sorted: &[u64], p: f64) -> u64 {
    if sorted.is_empty() {
        return 0;
    }
    let idx = ((sorted.len() as f64) * p).ceil() as usize;
    sorted[idx.clamp(1, sorted.len()) - 1]
}

/// Runs a scenario against `addr` on the current runtime.
///
/// Workers run request/response loops (awaiting each response fully before
/// issuing the next request), so tasks yield naturally like real traffic.
pub async fn run_scenario(
    addr: SocketAddr,
    scenario: Scenario,
    warmup: Duration,
    measure: Duration,
) -> anyhow::Result<ScenarioResult> {
    let base = format!("http://{addr}");
    let clients: Vec<reqwest::Client> = (0..scenario.connections)
        .map(|_| {
            reqwest::Client::builder()
                .http2_prior_knowledge()
                .no_proxy()
                .build()
                .map_err(anyhow::Error::from)
        })
        .collect::<anyhow::Result<_>>()?;

    let upload_body = match scenario.workload {
        Workload::Echo(size) => Some(make_payload(size)),
        Workload::Download(_) => None,
    };
    let url = format!("{base}{}", scenario.workload.path());

    // Warmup phase: not measured, establishes connections and primes windows.
    let stop = Arc::new(AtomicBool::new(false));
    let measuring = Arc::new(AtomicBool::new(false));

    let mut handles = Vec::with_capacity(scenario.concurrency);
    for worker in 0..scenario.concurrency {
        let client = clients[worker % clients.len()].clone();
        let url = url.clone();
        let upload_body = upload_body.clone();
        let stop = stop.clone();
        let measuring = measuring.clone();
        handles.push(tokio::spawn(async move {
            let mut latencies: Vec<u64> = Vec::with_capacity(16 * 1024);
            let mut bytes_received: u64 = 0;
            while !stop.load(Ordering::Relaxed) {
                let start = Instant::now();
                let resp = match &upload_body {
                    Some(body) => client.post(&url).body(body.clone()).send().await,
                    None => client.get(&url).send().await,
                };
                let resp = resp.expect("request failed");
                assert!(resp.status().is_success(), "bad status: {}", resp.status());
                let body = resp.bytes().await.expect("body read failed");
                if measuring.load(Ordering::Relaxed) {
                    latencies.push(start.elapsed().as_micros() as u64);
                    bytes_received += body.len() as u64;
                }
            }
            (latencies, bytes_received)
        }));
    }

    tokio::time::sleep(warmup).await;
    measuring.store(true, Ordering::Relaxed);
    let measure_start = Instant::now();
    tokio::time::sleep(measure).await;
    stop.store(true, Ordering::Relaxed);
    let elapsed = measure_start.elapsed();

    let mut latencies: Vec<u64> = Vec::new();
    let mut total_bytes: u64 = 0;
    for handle in handles {
        let (worker_latencies, worker_bytes) = handle.await?;
        latencies.extend(worker_latencies);
        total_bytes += worker_bytes;
    }
    latencies.sort_unstable();

    let requests = latencies.len() as u64;
    let secs = elapsed.as_secs_f64();
    // For echo workloads count upload + download bytes.
    let payload_factor = match scenario.workload {
        Workload::Echo(_) => 2,
        Workload::Download(_) => 1,
    };
    Ok(ScenarioResult {
        name: scenario.name.to_string(),
        connections: scenario.connections,
        concurrency: scenario.concurrency,
        duration_secs: secs,
        requests,
        rps: requests as f64 / secs,
        throughput_mb_s: (total_bytes * payload_factor) as f64 / (1024.0 * 1024.0) / secs,
        p50_us: percentile(&latencies, 0.50),
        p90_us: percentile(&latencies, 0.90),
        p99_us: percentile(&latencies, 0.99),
        max_us: latencies.last().copied().unwrap_or(0),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_deterministic() {
        assert_eq!(make_payload(SIZE_1K), make_payload(SIZE_1K));
        assert_eq!(make_payload(SIZE_1K).len(), SIZE_1K);
    }

    #[test]
    fn percentile_bounds() {
        let sorted = vec![10, 20, 30, 40];
        assert_eq!(percentile(&sorted, 0.50), 20);
        assert_eq!(percentile(&sorted, 0.99), 40);
        assert_eq!(percentile(&[], 0.50), 0);
    }

    #[test]
    fn smoke_one_scenario() {
        let server = BenchServer::spawn(2).expect("server");
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("runtime");
        let result = runtime
            .block_on(run_scenario(
                server.addr,
                Scenario {
                    name: "smoke",
                    workload: Workload::Download(SIZE_1K),
                    connections: 1,
                    concurrency: 4,
                },
                Duration::from_millis(50),
                Duration::from_millis(200),
            ))
            .expect("scenario");
        assert!(result.requests > 0);
    }
}
