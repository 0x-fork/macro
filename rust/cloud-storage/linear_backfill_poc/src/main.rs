use anyhow::{Context, Result, bail};
use chrono::{DateTime, Duration, Utc};
use clap::Parser;
use serde::Deserialize;
use serde_json::{Value, json};

const LINEAR_GRAPHQL_URL: &str = "https://api.linear.app/graphql";
const PAGE_SIZE: u32 = 50;

#[derive(Parser, Debug)]
#[command(about = "POC: backfill a Linear workspace into Macro tasks (logs only)")]
struct Args {
    /// Only fetch issues that are not done (state.type != completed && != canceled)
    #[arg(long, default_value_t = false)]
    only_not_done: bool,

    /// Only fetch issues updated in the last N days
    #[arg(long)]
    last_updated_window_days: Option<i64>,
}

#[derive(Debug, Deserialize, Clone)]
struct PageInfo {
    #[serde(rename = "hasNextPage")]
    has_next_page: bool,
    #[serde(rename = "endCursor")]
    end_cursor: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct Connection<T> {
    nodes: Vec<T>,
    #[serde(rename = "pageInfo", default = "PageInfo::empty")]
    page_info: PageInfo,
}

impl PageInfo {
    fn empty() -> Self {
        Self {
            has_next_page: false,
            end_cursor: None,
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
struct ProjectIssueUpdatedAt {
    #[serde(rename = "updatedAt")]
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Clone)]
struct Project {
    id: String,
    name: String,
    #[serde(rename = "updatedAt")]
    updated_at: DateTime<Utc>,
    issues: Connection<ProjectIssueUpdatedAt>,
}

impl Project {
    /// updatedAt of the most recently updated issue in the project, falling
    /// back to the project's own updatedAt if it has no issues.
    fn last_issue_updated_at(&self) -> DateTime<Utc> {
        self.issues
            .nodes
            .first()
            .map(|i| i.updated_at)
            .unwrap_or(self.updated_at)
    }
}

#[derive(Debug, Deserialize)]
struct State {
    name: String,
    #[serde(rename = "type")]
    type_: String,
}

#[derive(Debug, Deserialize)]
struct Cycle {
    number: i64,
    #[serde(rename = "endsAt")]
    ends_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
struct IssueRef {
    identifier: String,
    title: String,
}

#[derive(Debug, Deserialize)]
struct RelationEdge {
    #[serde(rename = "type")]
    type_: String,
    #[serde(rename = "relatedIssue")]
    related_issue: Option<IssueRef>,
}

#[derive(Debug, Deserialize)]
struct CommentUser {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Comment {
    body: String,
    user: Option<CommentUser>,
    #[serde(rename = "createdAt")]
    created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct Attachment {
    title: String,
    url: String,
    source: Option<Value>,
    metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct Issue {
    identifier: String,
    title: String,
    description: Option<String>,
    #[serde(rename = "priorityLabel")]
    priority_label: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: DateTime<Utc>,
    state: Option<State>,
    cycle: Option<Cycle>,
    parent: Option<IssueRef>,
    children: Connection<IssueRef>,
    relations: Connection<RelationEdge>,
    #[serde(rename = "inverseRelations")]
    inverse_relations: Connection<RelationEdge>,
    comments: Connection<Comment>,
    attachments: Connection<Attachment>,
}

#[derive(Debug, Deserialize)]
struct GraphQLResponse<T> {
    data: Option<T>,
    errors: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct ProjectsData {
    projects: Connection<Project>,
}

#[derive(Debug, Deserialize)]
struct IssuesData {
    issues: Connection<Issue>,
}

const PROJECTS_QUERY: &str = r#"
query Projects($first: Int!, $after: String) {
  projects(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      updatedAt
      issues(first: 1, orderBy: updatedAt) {
        nodes { updatedAt }
      }
    }
  }
}
"#;

const ISSUES_QUERY: &str = r#"
query Issues($filter: IssueFilter, $first: Int!, $after: String) {
  issues(first: $first, after: $after, filter: $filter) {
    pageInfo { hasNextPage endCursor }
    nodes {
      identifier
      title
      description
      priorityLabel
      updatedAt
      state { name type }
      cycle { number endsAt }
      parent { identifier title }
      children { nodes { identifier title } }
      relations { nodes { type relatedIssue { identifier title } } }
      inverseRelations { nodes { type relatedIssue { identifier title } } }
      comments { nodes { body createdAt user { name } } }
      attachments { nodes { title url source metadata } }
    }
  }
}
"#;

async fn graphql<T: for<'de> Deserialize<'de>>(
    client: &reqwest::Client,
    api_key: &str,
    query: &str,
    variables: Value,
) -> Result<T> {
    let body = json!({ "query": query, "variables": variables });
    let resp = client
        .post(LINEAR_GRAPHQL_URL)
        .header("Authorization", api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .context("linear request failed")?;

    let status = resp.status();
    let text = resp.text().await.context("read linear response body")?;
    if !status.is_success() {
        bail!("linear http {}: {}", status, text);
    }
    let parsed: GraphQLResponse<T> =
        serde_json::from_str(&text).with_context(|| format!("parse linear response: {}", text))?;
    if let Some(errs) = parsed.errors {
        bail!("graphql errors: {}", errs);
    }
    parsed.data.context("no data in linear response")
}

async fn fetch_projects(client: &reqwest::Client, api_key: &str) -> Result<Vec<Project>> {
    let mut all = Vec::new();
    let mut after: Option<String> = None;
    loop {
        let vars = json!({ "first": PAGE_SIZE, "after": after });
        let data: ProjectsData = graphql(client, api_key, PROJECTS_QUERY, vars).await?;
        all.extend(data.projects.nodes);
        if !data.projects.page_info.has_next_page {
            break;
        }
        after = data.projects.page_info.end_cursor;
    }
    Ok(all)
}

async fn fetch_issues(
    client: &reqwest::Client,
    api_key: &str,
    project_id: &str,
    only_not_done: bool,
    updated_after: Option<DateTime<Utc>>,
) -> Result<Vec<Issue>> {
    let mut filter = json!({ "project": { "id": { "eq": project_id } } });
    if only_not_done {
        filter["state"] = json!({ "type": { "nin": ["completed", "canceled"] } });
    }
    if let Some(t) = updated_after {
        filter["updatedAt"] = json!({ "gte": t.to_rfc3339() });
    }

    let mut all = Vec::new();
    let mut after: Option<String> = None;
    loop {
        let vars = json!({ "filter": filter, "first": PAGE_SIZE, "after": after });
        let data: IssuesData = graphql(client, api_key, ISSUES_QUERY, vars).await?;
        all.extend(data.issues.nodes);
        if !data.issues.page_info.has_next_page {
            break;
        }
        after = data.issues.page_info.end_cursor;
    }
    Ok(all)
}

fn log_issue(issue: &Issue, project: &Project) {
    println!("===========================================================");
    println!(
        "[{}] {} — project: {}",
        issue.identifier, issue.title, project.name
    );
    if let Some(state) = &issue.state {
        println!("  Status: {} (type={})", state.name, state.type_);
    }
    if let Some(p) = &issue.priority_label {
        println!("  Priority: {}", p);
    }
    println!("  Updated: {}", issue.updated_at);

    if let Some(c) = &issue.cycle {
        let ends = c
            .ends_at
            .map(|d| d.to_rfc3339())
            .unwrap_or_else(|| "n/a".into());
        println!("  Cycle: #{} ends {}", c.number, ends);
    }

    if let Some(parent) = &issue.parent {
        println!("  Parent: [{}] {}", parent.identifier, parent.title);
    }

    if !issue.children.nodes.is_empty() {
        println!("  Subtasks ({}):", issue.children.nodes.len());
        for c in &issue.children.nodes {
            println!("    - [{}] {}", c.identifier, c.title);
        }
    }

    let rel_total = issue.relations.nodes.len() + issue.inverse_relations.nodes.len();
    if rel_total > 0 {
        println!("  Relations:");
        for e in &issue.relations.nodes {
            if let Some(ri) = &e.related_issue {
                println!("    - {} → [{}] {}", e.type_, ri.identifier, ri.title);
            }
        }
        for e in &issue.inverse_relations.nodes {
            if let Some(ri) = &e.related_issue {
                println!("    - {} ← [{}] {}", e.type_, ri.identifier, ri.title);
            }
        }
    }

    if !issue.attachments.nodes.is_empty() {
        println!("  Attachments ({}):", issue.attachments.nodes.len());
        for a in &issue.attachments.nodes {
            let src = a
                .source
                .as_ref()
                .and_then(|s| s.get("type"))
                .and_then(|s| s.as_str())
                .unwrap_or("unknown");
            let meta = a
                .metadata
                .as_ref()
                .map(|m| m.to_string())
                .unwrap_or_default();
            println!("    - [{}] {} → {} | meta={}", src, a.title, a.url, meta);
        }
    }

    if !issue.comments.nodes.is_empty() {
        println!("  Comments ({}):", issue.comments.nodes.len());
        for c in &issue.comments.nodes {
            let who = c
                .user
                .as_ref()
                .and_then(|u| u.name.as_deref())
                .unwrap_or("unknown");
            let first_line = c.body.lines().next().unwrap_or("");
            println!("    - {} @ {}: {}", who, c.created_at, first_line);
        }
    }

    println!("  Description:");
    match &issue.description {
        Some(d) if !d.is_empty() => {
            for line in d.lines() {
                println!("    {}", line);
            }
        }
        _ => println!("    (no description)"),
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    let api_key = std::env::var("LINEAR_API_KEY").context("LINEAR_API_KEY env var not set")?;

    let updated_after = args
        .last_updated_window_days
        .map(|d| Utc::now() - Duration::days(d));

    let client = reqwest::Client::builder()
        .build()
        .context("build reqwest client")?;

    println!(
        "Args: only_not_done={}, last_updated_window_days={:?}",
        args.only_not_done, args.last_updated_window_days
    );
    println!("Fetching projects…");
    let mut projects = fetch_projects(&client, &api_key).await?;
    projects.sort_by(|a, b| b.last_issue_updated_at().cmp(&a.last_issue_updated_at()));
    println!(
        "Found {} projects (ordered by most recent issue updatedAt desc):",
        projects.len()
    );
    for (i, p) in projects.iter().enumerate() {
        println!(
            "  {:>3}. {} — last issue updated {} ({})",
            i + 1,
            p.name,
            p.last_issue_updated_at(),
            p.id
        );
    }

    for project in &projects {
        println!("\n--- Project: {} ({}) ---", project.name, project.id);
        let issues = fetch_issues(
            &client,
            &api_key,
            &project.id,
            args.only_not_done,
            updated_after,
        )
        .await?;
        println!("Found {} issues", issues.len());
        for issue in &issues {
            log_issue(issue, project);
        }
    }

    Ok(())
}
