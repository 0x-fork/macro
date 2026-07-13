//! `SDK Check` — fails a PR if the SDK's generated layer (`js/sdk/generated`,
//! `js/sdk/specs`) has drifted from the Rust services' OpenAPI output, or if
//! the SDK no longer typechecks. Generated into `sdk-check.yml`.
//!
//! The freshness check runs `just update-generated` in `js/sdk` (the same
//! command developers run) and fails on any resulting diff under `js/sdk`.

use gh_workflow::{Concurrency, Event, Expression, Job, PullRequest, Run, Step, Workflow};

use crate::workflows::{runners, steps, vars};

/// Build the workflow.
pub fn sdk_check() -> Workflow {
    Workflow::new("SDK Check")
        .on(Event::default().pull_request(
            PullRequest::default()
                .add_branch("main")
                .add_path("js/sdk/**")
                .add_path("rust/cloud-storage/**/*.rs")
                .add_path("rust/cloud-storage/Cargo.toml")
                .add_path("rust/cloud-storage/Cargo.lock")
                .add_path("js/app/scripts/generate-api-schema.ts")
                .add_path("js/app/scripts/services.ts")
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

/// Regenerate the SDK's generated layer end-to-end and fail on drift, then
/// typecheck. Shares the web CI cache volume so the gen-api Rust build hits
/// the same sccache as the web app checks.
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
        .add_step(check_coverage())
}

fn update_generated() -> Step<Run> {
    Step::new("Regenerate SDK code")
        .run("just update-generated")
        .working_directory("js/sdk")
}

fn verify_fresh() -> Step<Run> {
    Step::new("Verify generated code is fresh").run(indoc::indoc! {r#"
        if [ -n "$(git status --porcelain -- js/sdk)" ]; then
          echo "js/sdk generated code is stale. Run 'just update-generated' in js/sdk and commit the result."
          git status --porcelain -- js/sdk
          git diff -- js/sdk | head -200
          exit 1
        fi
    "#})
}

/// Every generated endpoint must either have a call site under `src/` or be
/// hand-listed in `src/coverage/skipped.ts`; fails naming the offenders.
fn check_coverage() -> Step<Run> {
    Step::new("Check endpoint coverage")
        .run("bun run coverage")
        .working_directory("js/sdk")
}

fn typecheck() -> Step<Run> {
    Step::new("Typecheck SDK")
        .run("bun run check")
        .working_directory("js/sdk")
}
