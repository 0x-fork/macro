//! `cargo deny check` — supply-chain gate (advisories / bans / licenses /
//! sources) for the cloud-storage Cargo workspace. Generated into
//! `cargo_deny.yml`.
//!
//! Runs cargo-deny directly (prebuilt binary) rather than via the EmbarkStudios
//! container action — that action is `runs.using: docker`, which would need
//! Docker on the runner and rebuild an image every run, for what is just a
//! `Cargo.lock` scan.

use gh_workflow::{Event, Job, PullRequest, PullRequestType, Run, Step, Use, Workflow};

use crate::workflows::{runners::Runner, steps, vars};

/// Build the workflow.
pub fn cargo_deny() -> Workflow {
    Workflow::new("cargo deny check")
        .on(Event::default().pull_request(
            PullRequest::default()
                .add_branch("main")
                .add_type(PullRequestType::Opened)
                .add_type(PullRequestType::Synchronize)
                .add_type(PullRequestType::Reopened)
                .add_type(PullRequestType::ReadyForReview)
                .add_path("rust/cloud-storage/Cargo.toml")
                .add_path("rust/cloud-storage/**/Cargo.toml")
                .add_path("rust/cloud-storage/Cargo.lock")
                .add_path("rust/cloud-storage/deny.toml")
                .add_path(".github/workflows/cargo_deny.yml"),
        ))
        .concurrency(vars::concurrency("cargo-deny"))
        .add_job("cargo-deny", cargo_deny_job())
}

/// Install cargo-deny (prebuilt) and run it against the workspace manifest. No
/// Docker. Runs on the small Namespace profile — cargo-deny only reads
/// `Cargo.lock` (via `cargo metadata`), so no workspace cache is needed.
fn cargo_deny_job() -> Job {
    Job::default()
        .runs_on(Runner::LinuxSmall.to_string())
        .add_step(steps::checkout(false))
        .add_step(steps::setup_rust_light())
        .add_step(install_cargo_deny())
        .add_step(run_cargo_deny())
}

/// Install the `cargo-deny` binary via taiki-e/install-action — a prebuilt
/// release (JS action: no Docker, no compile-from-source). The version is
/// pinned for reproducibility; bump it deliberately.
fn install_cargo_deny() -> Step<Use> {
    Step::new("install cargo-deny")
        .uses(
            "taiki-e",
            "install-action",
            "9e1e5806d4a4822de933115878265be9aaa786d9",
        ) // v2
        .add_with(("tool", "cargo-deny@0.19.9"))
}

/// `cargo deny check` against the cloud-storage workspace manifest.
fn run_cargo_deny() -> Step<Run> {
    Step::new("cargo deny check")
        .run("cargo deny --manifest-path rust/cloud-storage/Cargo.toml check")
}
