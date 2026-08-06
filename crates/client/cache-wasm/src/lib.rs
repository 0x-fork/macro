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

/// Registers browser-console tracing with the requested `RUST_LOG` filter.
///
/// Events are routed to the browser console and spans are recorded as
/// performance measures. The JavaScript host should call this once, immediately
/// after instantiating the WASM module, only when tracing is explicitly enabled.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen(js_name = initializeTracing)]
pub fn initialize_tracing(rust_log: &str) -> Result<(), wasm_bindgen::JsError> {
    use tracing_subscriber::{
        EnvFilter,
        fmt::format::{FmtSpan, Pretty},
        prelude::*,
    };
    use tracing_web::{MakeWebConsoleWriter, performance_layer};

    let filter = EnvFilter::try_new(rust_log)
        .map_err(|error| wasm_bindgen::JsError::new(&error.to_string()))?;
    let console_layer = tracing_subscriber::fmt::layer()
        .with_ansi(false)
        .with_span_events(FmtSpan::CLOSE)
        .with_writer(MakeWebConsoleWriter::new())
        .without_time();
    tracing_subscriber::registry()
        .with(filter)
        .with(console_layer)
        .with(performance_layer().with_details_from_fields(Pretty::default()))
        .try_init()
        .map_err(|error| wasm_bindgen::JsError::new(&error.to_string()))
}
