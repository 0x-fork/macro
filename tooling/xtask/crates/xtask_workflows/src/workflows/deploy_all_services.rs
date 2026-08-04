//! `Deploy All Services` — the shared cloud-storage deploy pipeline: two
//! consolidated build jobs (all service binaries via crane; all lambda
//! handlers via crane + cargo-zigbuild) each realise their whole closure in a
//! single `nix build` on a large-build runner, hand the per-service artifacts off
//! through Namespace artifact storage, then DB migrations run and every
//! service deploys via Pulumi. Called by `deploy_cloud_storage_on_push` (dev)
//! and `release-production` (prod), and manually dispatchable. Generated into
//! `deploy_all_services.yml` (replaces the hand-written
//! `deploy-all-services.yml`).
//!
//! Why consolidated jobs instead of a per-service matrix: Namespace cache
//! volumes are a *pool* of independent copies — each concurrent job checks
//! out its own volume and writes never merge back into the others. A 30-wide
//! matrix therefore mostly draws cold or stale /nix volumes (and blows the
//! cache quota, so warm ones get evicted), rebuilding the shared dep closure
//! over and over. One job per closure, each on its own cache tag, checks out
//! exactly the volume its previous run committed — so the cache actually
//! persists run-to-run, and nix parallelises the per-service builds across
//! the large-build runner's cores instead of across runners.

use anyhow::Result;
use gh_workflow::{
    Concurrency, Env, Event, Expression, Job, Run, Step, Strategy, Use, Workflow, WorkflowCall,
    WorkflowDispatch,
};

use crate::workflows::{runners, steps, vars};

/// The in-VPC self-hosted runner with network access to the databases. Stays
/// off Namespace deliberately — migrations need to reach RDS.
const DB_MIGRATOR_RUNNER: &str = "db-migrator";

/// Fixed cache tags for the two deploy /nix volumes. Namespace scopes cache
/// volumes per branch by default; pinning a tag makes the dev deploy (main)
/// and the prod deploy (release refs) read/write the *same* volume, so a prod
/// deploy of a commit dev already built is a pure cache hit.
///
/// One tag *per build job*, not one shared: volumes under a tag are handed out
/// nondeterministically, so two concurrent jobs on one tag would randomly swap
/// volumes and miss each other's closure. The closures are near-disjoint
/// anyway (native crane builds vs cargo-zigbuild/musl), so separate tags keep
/// each volume small and only re-staled by its own toolchain's churn.
const NIX_DEPLOY_BINARIES_CACHE_TAG: &str = "nix-deploy-binaries";
/// See [`NIX_DEPLOY_BINARIES_CACHE_TAG`].
const NIX_DEPLOY_LAMBDAS_CACHE_TAG: &str = "nix-deploy-lambdas";

/// Build the workflow. The dispatch/call input blocks are filled in by
/// [`patch`].
pub fn deploy_all_services() -> Workflow {
    Workflow::new("Deploy All Services")
        .on(Event::default()
            .workflow_dispatch(WorkflowDispatch::default())
            .workflow_call(WorkflowCall::default()))
        .concurrency(
            // Only run 1 deploy-all workflow at a time per environment.
            // Literal prefix: for workflow_call runs `github.workflow` expands
            // to the *caller's* name, which would split dispatches and callers
            // into separate groups and let them race the same Pulumi stacks.
            // Groups are repo-global strings, so the on-push caller shares
            // this group by using the same literal.
            Concurrency::new(Expression::new(
                "deploy-all-services-${{ inputs.environment }}",
            ))
            .cancel_in_progress(false),
        )
        .add_job("setup", setup())
        .add_job("build-binaries", build_binaries())
        .add_job("build-lambdas", build_lambdas())
        .add_job("migrate-db", migrate_db())
        .add_job("deploy-services", deploy_services())
        .add_job("deployment-summary", deployment_summary())
}

/// Fill in the ordered dispatch/call input blocks.
pub fn patch(root: &mut serde_yaml::Value) -> Result<()> {
    let on = root
        .get_mut("on")
        .and_then(serde_yaml::Value::as_mapping_mut)
        .ok_or_else(|| anyhow::anyhow!("rendered workflow has no `on` mapping"))?;
    on.insert(
        "workflow_dispatch".into(),
        crate::workflows::yaml_fragment(indoc::indoc! {r#"
            inputs:
              environment:
                type: choice
                required: true
                default: 'dev'
                options:
                  - dev
                  - prod
                description: The environment we are deploying to.
        "#})?,
    );
    on.insert(
        "workflow_call".into(),
        crate::workflows::yaml_fragment(indoc::indoc! {r#"
            inputs:
              environment:
                type: string
                required: true
                description: The environment we are deploying to.
            secrets:
              AWS_ACCESS_KEY:
                required: true
              AWS_SECRET_ACCESS_KEY:
                required: true
              PULUMI_ACCESS_TOKEN:
                required: true
              DD_APP_KEY:
                required: true
              DD_API_KEY:
                required: true
        "#})?,
    );
    Ok(())
}

fn setup() -> Job {
    Job::default()
        .name("Setup Deployment Matrix")
        .runs_on(runners::Runner::TinyNoCache.to_string())
        .add_output("matrix", "${{ steps.set-matrix.outputs.matrix }}")
        .add_output("binaries", "${{ steps.set-matrix.outputs.binaries }}")
        .add_output("lambdas", "${{ steps.set-matrix.outputs.lambdas }}")
        .add_step(steps::checkout_v4())
        .add_step(set_matrix())
}

fn set_matrix() -> Step<Run> {
    Step::new("Set deployment matrix")
        .run(indoc::indoc! {r#"
            set -euo pipefail
            cfg=.github/services-config.json
            # Full list drives deploy-services; the filtered lists gate the
            # build job (skipped when nothing produces an artifact) and record
            # which services ship binaries vs lambdas.
            services=$(jq -c '.services | keys' "$cfg")
            binaries=$(jq -c '[.services | to_entries[] | select((.value.deploy_binaries // []) | length > 0) | .key]' "$cfg")
            lambdas=$(jq -c '[.services | to_entries[] | select((.value.deploy_lambdas // []) | length > 0) | .key]' "$cfg")
            echo "matrix=${services}" >> "$GITHUB_OUTPUT"
            echo "binaries=${binaries}" >> "$GITHUB_OUTPUT"
            echo "lambdas=${lambdas}" >> "$GITHUB_OUTPUT"
            echo "All services: ${services}"
            echo "With binaries: ${binaries}"
            echo "With lambdas: ${lambdas}"
        "#})
        .id("set-matrix")
}

/// Base for the two consolidated build jobs: one volume checkout, one nix
/// setup, then a single `nix build` of that job's whole closure so nix
/// parallelises every service across the large-build runner's cores. Each job pins its
/// own cache tag so every run — dev or prod, any ref — deterministically
/// checks out that closure's always-warm /nix volume.
fn consolidated_build_job(name: &str, gate_output: &str, cache_tag: &str) -> Job {
    Job::default()
        .name(name)
        .needs(vec!["setup".to_string()])
        .cond(Expression::new(format!(
            "${{{{ needs.setup.outputs.{gate_output} != '[]' }}}}"
        )))
        .runs_on(runners::Runner::LargeBuild.with_cache_tag(cache_tag))
        .add_step(steps::checkout_v4().add_with(("clean", false)))
        .add_step(steps::mount_nix_cache_volume())
        .add_step(steps::setup_nix())
}

/// Native crane builds of every service's release binaries.
fn build_binaries() -> Job {
    consolidated_build_job(
        "Build all service binaries",
        "binaries",
        NIX_DEPLOY_BINARIES_CACHE_TAG,
    )
    .add_step(build_all_binary_targets())
    .add_step(package_binary_handoffs())
    .add_step(steps::teardown_nix())
}

/// crane + cargo-zigbuild builds of every service's Lambda handlers.
fn build_lambdas() -> Job {
    consolidated_build_job(
        "Build all Lambda artifacts",
        "lambdas",
        NIX_DEPLOY_LAMBDAS_CACHE_TAG,
    )
    .add_step(build_all_lambda_targets())
    .add_step(package_lambda_handoffs())
    .add_step(steps::teardown_nix())
}

fn build_all_binary_targets() -> Step<Run> {
    Step::new("Build all binary targets")
        .run(indoc::indoc! {r#"
            set -euo pipefail
            cfg=.github/services-config.json
            # One evaluation, every derivation: nix schedules all services'
            # crates across the runner's cores and the shared dep closure
            # builds once instead of once per runner. --keep-going surfaces
            # every broken service in a single run instead of the first.
            installables=()
            while IFS= read -r svc; do
              installables+=(".#deploy-service-binaries-${svc}")
            done < <(jq -r '.services | to_entries[] | select((.value.deploy_binaries // []) | length > 0) | .key' "$cfg")
            echo "Building ${#installables[@]} binary targets"
            nix build --no-link --keep-going --print-build-logs "${installables[@]}"
        "#})
        .shell("bash")
}

fn build_all_lambda_targets() -> Step<Run> {
    Step::new("Build all Lambda targets")
        .run(indoc::indoc! {r#"
            set -euo pipefail
            cfg=.github/services-config.json
            # One evaluation, every handler derivation: see the binary job's
            # build step for why this beats per-service invocations.
            installables=()
            while IFS= read -r lambda; do
              installables+=(".#deploy-lambda-${lambda}")
            done < <(jq -r '[.services[].deploy_lambdas[]?] | unique | .[]' "$cfg")
            echo "Building ${#installables[@]} Lambda targets"
            nix build --no-link --keep-going --print-build-logs "${installables[@]}"
        "#})
        .shell("bash")
}

fn package_binary_handoffs() -> Step<Run> {
    Step::new("Package and upload binary handoffs")
        .run(indoc::indoc! {r#"
            set -euo pipefail
            cfg=.github/services-config.json
            while IFS= read -r svc; do
              rm -rf prebuilt result
              mkdir -p prebuilt/nix-store
              nix build ".#deploy-service-binaries-${svc}"
              cp -r result/bin/* prebuilt/
              while IFS= read -r store_path; do
                cp -a "$store_path" prebuilt/nix-store/
              done < <(nix-store -qR result)
              touch prebuilt/.keep
              tar -C prebuilt -czf prebuilt-binaries.tar.gz .
              # Store copies are read-only; restore write bits so the next
              # iteration's rm -rf works.
              chmod -R u+w prebuilt
              # Receipt: the deploy job logs the same hash on read.
              echo "handoff receipt (${svc}): $(sha256sum prebuilt-binaries.tar.gz | cut -d' ' -f1) ($(stat -c%s prebuilt-binaries.tar.gz) bytes)"
              nsc artifact upload prebuilt-binaries.tar.gz "handoff/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}/${svc}/prebuilt-binaries.tar.gz" --expires_in=24h
            done < <(jq -r '.services | to_entries[] | select((.value.deploy_binaries // []) | length > 0) | .key' "$cfg")
        "#})
        .shell("bash")
}

/// Each handler is a crane + cargo-zigbuild nix package already realised by
/// the build step, so the per-service script runs are pure cache hits that
/// just assemble the target/lambda/<name>/ zip layout the deploy action
/// consumes.
fn package_lambda_handoffs() -> Step<Run> {
    Step::new("Package and upload lambda handoffs")
        .run(indoc::indoc! {r#"
            set -euo pipefail
            cfg=.github/services-config.json
            while IFS= read -r svc; do
              SERVICE="$svc" .github/scripts/build-cloud-storage-lambdas-nix.sh
              # Receipt: the deploy job logs the same hash on read.
              echo "handoff receipt (${svc}): $(sha256sum lambda-artifacts.tar.gz | cut -d' ' -f1) ($(stat -c%s lambda-artifacts.tar.gz) bytes)"
              nsc artifact upload lambda-artifacts.tar.gz "handoff/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}/${svc}/lambda-artifacts.tar.gz" --expires_in=24h
            done < <(jq -r '.services | to_entries[] | select((.value.deploy_lambdas // []) | length > 0) | .key' "$cfg")
        "#})
        .shell("bash")
}

fn migrate_db() -> Job {
    Job::default()
        .name("Run Database Migrations")
        .needs(vec![
            "setup".to_string(),
            "build-binaries".to_string(),
            "build-lambdas".to_string(),
        ])
        .cond(Expression::new(
            "${{ !cancelled() && needs.setup.outputs.matrix != '[]' && !contains(needs.*.result, 'failure') && !contains(needs.*.result, 'cancelled') }}",
        ))
        .runs_on(DB_MIGRATOR_RUNNER)
        .add_step(steps::checkout_v4().add_with(("sparse-checkout", ".github/")))
        .add_step(run_migrations())
}

fn run_migrations() -> Step<Use> {
    steps::uses_local(
        "Run migrations",
        xtask_paths::repo_dir!(".github/actions/migrate-cloud-storage-db"),
    )
    .add_with(("environment", "${{ inputs.environment }}"))
}

/// Deploys via Pulumi + Docker; AWS auth is via explicit static keys
/// (configure-aws-credentials). PULUMI_HOME is pinned to a fixed path (outside
/// the workspace, which the deploy action's checkout cleans) so the plugins
/// subdir can be backed by a sticky disk; it propagates into the composite
/// action's pulumi step via the job env.
fn deploy_services() -> Job {
    Job::default()
        .name("Deploy ${{ matrix.service }}")
        .needs(vec![
            "setup".to_string(),
            "build-binaries".to_string(),
            "build-lambdas".to_string(),
            "migrate-db".to_string(),
        ])
        .cond(Expression::new(
            "${{ !cancelled() && needs.setup.outputs.matrix != '[]' && needs.migrate-db.result == 'success' && !contains(needs.*.result, 'failure') && !contains(needs.*.result, 'cancelled') }}",
        ))
        .runs_on(runners::Runner::Small.to_string())
        .add_env(("PULUMI_HOME", "/pulumi"))
        .strategy(Strategy {
            fail_fast: Some(false),
            matrix: Some(serde_json::json!({
                "service": "${{ fromJson(needs.setup.outputs.matrix) }}",
            })),
            max_parallel: None,
        })
        .add_step(steps::checkout_v4())
        .add_step(get_project_name())
        .add_step(check_artifact_config())
        .add_step(download_handoff_artifacts())
        .add_step(steps::cache_pulumi_plugins())
        .add_step(steps::ensure_pulumi_home_writable())
        .add_step(deploy_service())
}

fn get_project_name() -> Step<Use> {
    steps::uses_local(
        "Get project name",
        xtask_paths::repo_dir!(".github/actions/get-project-name"),
    )
    .id("project-name")
    .add_with(("service-name", "${{ matrix.service }}"))
}

fn check_artifact_config() -> Step<Run> {
    Step::new("Check artifact config")
        .run(indoc::indoc! {r#"
            has_binaries=$(jq -r --arg service "$SERVICE" '((.services[$service].deploy_binaries // []) | length) > 0' .github/services-config.json)
            has_lambdas=$(jq -r --arg service "$SERVICE" '((.services[$service].deploy_lambdas // []) | length) > 0' .github/services-config.json)
            echo "has_binaries=$has_binaries" >> "$GITHUB_OUTPUT"
            echo "has_lambdas=$has_lambdas" >> "$GITHUB_OUTPUT"
        "#})
        .id("check-artifacts")
        .add_env(Env::new("SERVICE", "${{ matrix.service }}"))
}

/// Pull the handoff tars from Namespace artifact storage into runner.temp
/// (outside the workspace, which the composite action's checkout cleans).
/// The composite's tar-path branch handles receipts + the extract guard.
fn download_handoff_artifacts() -> Step<Run> {
    Step::new("Download handoff artifacts")
        .run(indoc::indoc! {r#"
            set -euo pipefail
            if ! command -v nsc >/dev/null 2>&1; then
              echo "::error::nsc CLI not found — this job expects a Namespace runner (or add namespacelabs/nscloud-setup)"
              exit 1
            fi
            mkdir -p "$RUNNER_TEMP/handoff"
            if [[ "$HAS_BINARIES" == "true" ]]; then
              nsc artifact download "$BASE/prebuilt-binaries.tar.gz" "$RUNNER_TEMP/handoff/prebuilt-binaries.tar.gz"
            fi
            if [[ "$HAS_LAMBDAS" == "true" ]]; then
              nsc artifact download "$BASE/lambda-artifacts.tar.gz" "$RUNNER_TEMP/handoff/lambda-artifacts.tar.gz"
            fi
        "#})
        .if_condition(Expression::new(
            "${{ steps.check-artifacts.outputs.has_binaries == 'true' || steps.check-artifacts.outputs.has_lambdas == 'true' }}",
        ))
        .shell("bash")
        .add_env(Env::new(
            "HAS_BINARIES",
            "${{ steps.check-artifacts.outputs.has_binaries }}",
        ))
        .add_env(Env::new(
            "HAS_LAMBDAS",
            "${{ steps.check-artifacts.outputs.has_lambdas }}",
        ))
        .add_env(Env::new(
            "BASE",
            "handoff/${{ github.run_id }}-${{ github.run_attempt }}/${{ matrix.service }}",
        ))
}

fn deploy_service() -> Step<Use> {
    steps::uses_local(
        "Deploy ${{ matrix.service }}",
        xtask_paths::repo_dir!(".github/actions/deploy-cloud-storage-pulumi"),
    )
    .add_with(("environment", "${{ inputs.environment }}"))
    .add_with(("aws-access-key", vars::AWS_ACCESS_KEY))
    .add_with(("aws-secret-key", vars::AWS_SECRET_ACCESS_KEY))
    .add_with(("pulumi-access-token", vars::PULUMI_ACCESS_TOKEN))
    .add_with((
        "pulumi-service-name",
        "${{ steps.project-name.outputs.project-name }}",
    ))
    .add_with(("use-namespace-builder", "true"))
    .add_with((
        "prebuilt-binaries-tar",
        "${{ steps.check-artifacts.outputs.has_binaries == 'true' && format('{0}/handoff/prebuilt-binaries.tar.gz', runner.temp) || '' }}",
    ))
    .add_with((
        "lambda-artifacts-tar",
        "${{ steps.check-artifacts.outputs.has_lambdas == 'true' && format('{0}/handoff/lambda-artifacts.tar.gz', runner.temp) || '' }}",
    ))
    .add_with(("dd-app-key", vars::DD_APP_KEY))
    .add_with(("dd-api-key", vars::DD_API_KEY))
}

fn deployment_summary() -> Job {
    Job::default()
        .name("Deployment Summary")
        .runs_on(runners::Runner::TinyNoCache.to_string())
        .needs(vec![
            "setup".to_string(),
            "build-binaries".to_string(),
            "build-lambdas".to_string(),
            "migrate-db".to_string(),
            "deploy-services".to_string(),
        ])
        .cond(Expression::new("always()"))
        .add_step(check_deployment_results())
}

fn check_deployment_results() -> Step<Run> {
    Step::new("Check deployment results")
        .run(indoc::indoc! {r#"
        if [[ "${{ needs.setup.result }}" == "failure" ]]; then
          echo "❌ Deployment setup failed"
          exit 1
        elif [[ "${{ needs.setup.result }}" == "skipped" ]]; then
          echo "⏭️ Deployment setup was skipped"
        elif [[ "${{ needs.build-binaries.result }}" == "failure" ]]; then
          echo "❌ Building service binaries failed"
          exit 1
        elif [[ "${{ needs.build-lambdas.result }}" == "failure" ]]; then
          echo "❌ Building Lambda artifacts failed"
          exit 1
        elif [[ "${{ needs.migrate-db.result }}" == "failure" ]]; then
          echo "❌ Database migrations failed"
          exit 1
        elif [[ "${{ needs.deploy-services.result }}" == "failure" ]]; then
          echo "❌ One or more service deployments failed"
          exit 1
        elif [[ "${{ needs.deploy-services.result }}" == "skipped" ]]; then
          echo "⏭️ No services to deploy"
        else
          echo "✅ All service deployments completed successfully for $ENVIRONMENT environment"
        fi
    "#})
        .shell("bash")
        .add_env(Env::new("ENVIRONMENT", "${{ inputs.environment }}"))
}
