//! wasm-bindgen shell around the cache engine + IndexedDB storage.
//!
//! Exposes a `CacheEngine` class to the JS worker glue
//! (`apps/web/src/lib/graphql-cache/`). All methods return Promises; the
//! engine is guarded by an async mutex so overlapping calls from the JS side
//! serialize safely instead of tripping reentrancy.
//!
//! Operation ids cross the boundary as strings (`"{clientId}:{urqlKey}"`)
//! so multiple tabs/webviews can register operations against one shared
//! engine without collisions; they're interned to the engine's `u64` ids
//! internally.

#[cfg(target_arch = "wasm32")]
mod shell;

#[cfg(target_arch = "wasm32")]
pub use shell::*;

/// Registers browser-console tracing before any cache exports are called.
///
/// Span-close events include `time.busy` and `time.idle`, making async cache
/// and storage timings visible in the worker console.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn initialize_tracing() {
    use tracing_subscriber::fmt::format::FmtSpan;
    use tracing_subscriber_wasm::MakeConsoleWriter;

    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_span_events(FmtSpan::CLOSE)
        .with_writer(MakeConsoleWriter::default().map_trace_level_to(tracing::Level::DEBUG))
        // The writer crate requires timestamps to be disabled in browsers.
        .without_time()
        .try_init();
}
