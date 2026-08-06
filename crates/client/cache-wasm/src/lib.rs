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

/// Registers browser-console tracing at the requested maximum level.
///
/// Events are routed to the browser console and spans are recorded as
/// performance measures. This must be called once by the JavaScript host
/// immediately after instantiating the WASM module.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen(js_name = initializeTracing)]
pub fn initialize_tracing(max_level: &str) -> Result<(), wasm_bindgen::JsError> {
    let max_level = match max_level {
        "DEBUG" => tracing::Level::DEBUG,
        "WARN" => tracing::Level::WARN,
        _ => {
            return Err(wasm_bindgen::JsError::new(
                "cache tracing level must be DEBUG or WARN",
            ));
        }
    };
    let mut config = wasm_tracing::WasmLayerConfig::new();
    config.set_max_level(max_level);
    wasm_tracing::set_as_global_default_with_config(config)
        .map_err(|error| wasm_bindgen::JsError::new(&error.to_string()))
}
