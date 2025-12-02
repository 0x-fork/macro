pub mod api;
mod config;
// 'core' is a reserved Rust name, so we alias it
#[path = "core/mod.rs"]
mod core;
mod model;
mod service;
