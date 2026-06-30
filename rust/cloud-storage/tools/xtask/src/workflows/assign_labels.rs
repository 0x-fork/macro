//! `Auto Label PRs` — applies coarse area labels from changed PR paths.

use gh_workflow::{Event, Job, Level, Permissions, PullRequest, PullRequestType, Step, Workflow};

use crate::workflows::{runners, steps};

/// Build the workflow.
pub fn assign_labels() -> Workflow {
    Workflow::new("Auto Label PRs")
        .on(Event::default().pull_request(
            PullRequest::default()
                .add_type(PullRequestType::Opened)
                .add_type(PullRequestType::Synchronize)
                .add_type(PullRequestType::Reopened),
        ))
        .add_job("label", label_job())
}

fn label_job() -> Job {
    Job::default()
        .runs_on(runners::Runner::LinuxTinyNoCache.to_string())
        .permissions(Permissions {
            contents: Some(Level::Read),
            pull_requests: Some(Level::Write),
            ..Default::default()
        })
        .add_step(steps::checkout(true))
        .add_step(changed_files())
        .add_step(label_by_paths())
}

fn changed_files() -> Step<gh_workflow::Use> {
    Step::new("Get changed files")
        .uses("tj-actions", "changed-files", "v47")
        .id("changed-files")
}

fn label_by_paths() -> Step<gh_workflow::Use> {
    Step::new("Label based on paths")
        .uses("actions", "github-script", "v7")
        .add_with(("github-token", "${{ secrets.GITHUB_TOKEN }}"))
        .add_with((
            "script",
            indoc::indoc! {r#"
                const changedFiles = `${{ steps.changed-files.outputs.all_changed_files }}`.split(' ');
                const labels = new Set();

                // Define path-to-label mappings
                const pathMappings = [
                  { path: 'rust/cloud-storage', label: 'cloud-storage' },
                  { path: 'js/app', label: 'web-app' },
                  { path: 'infra', label: 'infra' }
                ];

                // Check each changed file against path mappings
                for (const file of changedFiles) {
                  for (const mapping of pathMappings) {
                    if (file.startsWith(mapping.path)) {
                      labels.add(mapping.label);
                    }
                  }
                }

                // Add labels to the PR
                if (labels.size > 0) {
                  await github.rest.issues.addLabels({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    issue_number: context.issue.number,
                    labels: Array.from(labels)
                  });

                  console.log(`Added labels: ${Array.from(labels).join(', ')}`);
                } else {
                  console.log('No matching labels found for changed files');
                }
            "#},
        ))
}
