#![allow(unused)]

mod api;
mod config;
mod context;
mod insight;
mod serve;
mod service;

use utoipa::OpenApi;

fn main() {
    println!(
        "{}",
        api::swagger::ApiDoc::openapi().to_pretty_json().unwrap()
    );
}
