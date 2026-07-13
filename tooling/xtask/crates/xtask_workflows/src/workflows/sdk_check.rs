//! `SDK Check` — fails a PR if the SDK's `@hey-api/openapi-ts` generated layer
//! (`packages/sdk/generated`) has drifted from the app's committed OpenAPI
//! specs, or if the SDK no longer typechecks. Generated into `sdk-check.yml`.
//!
//! Scope is spec → SDK only: it runs `just generate` in `packages/sdk` (which
//! regenerates from `apps/web`'s committed `service-clients/*/openapi.json`) and
//! fails on any resulting diff under `packages/sdk`. The Rust → spec direction
//! is covered separately by `web-app-check-main`'s `gen-api --check`.

use gh_workflow::{Concurrency, Event, Expression, Job, PullRequest, Run, Step, Workflow};

use crate::workflows::{runners, steps, vars};

/// Build the workflow.
pub fn sdk_check() -> Workflow {
    Workflow::new("SDK Check")
        .on(Event::default().pull_request(
            PullRequest::default()
                .add_branch("main")
                .add_path("packages/sdk/**")
                .add_path("apps/web/src/lib/service-clients/*/openapi.json")
                .add_path(".github/workflows/sdk-check.yml"),
        ))
        .concurrency(
            Concurrency::new(Expression::new(
                "${{ github.workflow }}-${{ github.ref }}-check",
            ))
            .cancel_in_progress(true),
        )
        .add_job("check-sdk", check_sdk())
}

/// Regenerate the SDK's generated layer from the app's committed specs, fail on
/// drift, then typecheck. Shares the web CI cache volume for the bun toolchain
/// and cache used by the web app checks.
fn check_sdk() -> Job {
    Job::default()
        .name("SDK Generated Code Check")
        .runs_on(runners::Runner::Mid.with_cache_tag(vars::WEB_CI_CACHE_TAG))
        .add_step(steps::checkout(false, false))
        .add_step(steps::mount_web_cache_volume(true))
        .add_step(steps::setup_nix())
        .add_step(steps::setup_reqs_web("Setup Prereqs", false))
        .add_step(steps::pin_sccache_dir())
        .add_step(update_generated())
        .add_step(steps::show_sccache_stats())
        .add_step(verify_fresh())
        .add_step(typecheck())
}

fn update_generated() -> Step<Run> {
    Step::new("Regenerate SDK with hey-api")
        .run("just generate")
        .working_directory("packages/sdk")
}

fn verify_fresh() -> Step<Run> {
    Step::new("Verify generated code is fresh").run(indoc::indoc! {r#"
        if [ -n "$(git status --porcelain -- packages/sdk)" ]; then
          echo "packages/sdk generated code is stale. Run 'just generate' in packages/sdk and commit the result."
          git status --porcelain -- packages/sdk
          git diff -- packages/sdk | head -200
          exit 1
        fi
    "#})
}

fn typecheck() -> Step<Run> {
    Step::new("Typecheck SDK")
        .run("bun run check")
        .working_directory("packages/sdk")
}
