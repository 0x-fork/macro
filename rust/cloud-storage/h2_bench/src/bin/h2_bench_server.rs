//! Standalone benchmark server for load-testing with external HTTP/2 clients
//! (e.g. `h2load`). Serves the same routes as the in-process benchmark.
//!
//! Usage: `cargo run --release -p h2_bench --bin h2_bench_server [port] [threads]`

fn main() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    let port: u16 = args.next().map_or(Ok(8929), |arg| arg.parse())?;
    let threads: usize = args.next().map_or_else(
        || {
            Ok(std::thread::available_parallelism()
                .map(|parallelism| parallelism.get())
                .unwrap_or(4))
        },
        |arg| arg.parse(),
    )?;

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(threads)
        .enable_all()
        .build()?;
    runtime.block_on(async move {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
        println!(
            "h2_bench_server listening on 127.0.0.1:{port} with {threads} worker threads (h2c via prior knowledge)"
        );
        axum::serve(listener, h2_bench::router().into_make_service()).await?;
        Ok(())
    })
}
