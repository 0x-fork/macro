//! `Pull Request` — assigns a newly opened/reopened PR to its author.

use gh_workflow::{Event, Job, PullRequest, PullRequestType, Step, Workflow};

use crate::workflows::runners;

/// Build the workflow.
pub fn assign_author() -> Workflow {
    Workflow::new("Pull Request")
        .on(Event::default().pull_request(
            PullRequest::default()
                .add_type(PullRequestType::Opened)
                .add_type(PullRequestType::Reopened),
        ))
        .add_job("assign_author", assign_author_job())
}

fn assign_author_job() -> Job {
    Job::default()
        .name("Assign author to PR")
        .runs_on(runners::Runner::LinuxTinyNoCache.to_string())
        .add_step(Step::new("Assign author to PR").uses("technote-space", "assign-author", "v1"))
}
