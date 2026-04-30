use anyhow::{Context, Result, bail};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use clap::Parser;
use serde::Deserialize;
use serde_json::{Value, json};

const LINEAR_GRAPHQL_URL: &str = "https://api.linear.app/graphql";
const PAGE_SIZE: u32 = 50;

const MACRO_AUTH_HEADER: &str = "x-document-storage-service-auth-key";
const MACRO_USER_HEADER: &str = "x-document-storage-service-user-id";

// Task system property IDs (mirror system_properties::SystemPropertyKey).
const STATUS_PROPERTY_ID: &str = "00000001-0000-0000-0000-000000000002";
const PRIORITY_PROPERTY_ID: &str = "00000001-0000-0000-0000-000000000003";
const DUE_DATE_PROPERTY_ID: &str = "00000001-0000-0000-0000-000000000004";
const STORY_POINTS_PROPERTY_ID: &str = "00000001-0000-0000-0000-000000000009";

// Status option IDs (mirror StatusOption).
const STATUS_NOT_STARTED: &str = "00000001-0000-0000-0002-000000000001";
const STATUS_IN_PROGRESS: &str = "00000001-0000-0000-0002-000000000002";
const STATUS_COMPLETED: &str = "00000001-0000-0000-0002-000000000004";
const STATUS_CANCELED: &str = "00000001-0000-0000-0002-000000000005";

// Priority option IDs (mirror PriorityOption).
const PRIORITY_LOW: &str = "00000001-0000-0000-0003-000000000001";
const PRIORITY_MEDIUM: &str = "00000001-0000-0000-0003-000000000002";
const PRIORITY_HIGH: &str = "00000001-0000-0000-0003-000000000003";
const PRIORITY_CRITICAL: &str = "00000001-0000-0000-0003-000000000004";

#[derive(Parser, Debug)]
#[command(about = "POC: backfill a Linear workspace into Macro tasks")]
struct Args {
    /// Only fetch issues that are not done (state.type != completed && != canceled)
    #[arg(long, default_value_t = false)]
    only_not_done: bool,

    /// Only fetch issues updated in the last N days
    #[arg(long)]
    last_updated_window_days: Option<i64>,

    /// Base URL for the Macro document_storage_service (e.g. http://localhost:8080).
    /// Falls back to MACRO_BASE_URL env var if not provided.
    #[arg(long)]
    macro_base_url: Option<String>,

    /// Macro user ID to impersonate as the task creator (e.g. auth0|abc123)
    #[arg(long)]
    as_user: Option<String>,

    /// Skip making API calls; only log the issues we would create
    #[arg(long, default_value_t = false)]
    dry_run: bool,
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
struct UserRef {
    email: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
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
    #[serde(rename = "dueDate")]
    due_date: Option<String>,
    estimate: Option<f64>,
    state: Option<State>,
    cycle: Option<Cycle>,
    creator: Option<UserRef>,
    assignee: Option<UserRef>,
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
      dueDate
      estimate
      state { name type }
      cycle { number endsAt }
      creator { email displayName }
      assignee { email displayName }
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
    if let Some(est) = issue.estimate {
        println!("  Estimate: {}", est);
    }
    if let Some(due) = issue.due_date.as_deref() {
        println!("  Due date: {}", due);
    }
    println!("  Updated: {}", issue.updated_at);

    if let Some(creator) = &issue.creator {
        let name = creator.display_name.as_deref().unwrap_or("?");
        let email = creator.email.as_deref().unwrap_or("?");
        println!("  Creator: {} <{}>", name, email);
    }
    if let Some(a) = &issue.assignee {
        let name = a.display_name.as_deref().unwrap_or("?");
        let email = a.email.as_deref().unwrap_or("?");
        println!("  Assignee: {} <{}>", name, email);
    }

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

fn map_status(state_type: &str) -> Option<&'static str> {
    match state_type {
        "triage" | "backlog" | "unstarted" => Some(STATUS_NOT_STARTED),
        "started" => Some(STATUS_IN_PROGRESS),
        "completed" => Some(STATUS_COMPLETED),
        "canceled" => Some(STATUS_CANCELED),
        _ => None,
    }
}

fn map_priority(label: &str) -> Option<&'static str> {
    match label {
        "Urgent" => Some(PRIORITY_CRITICAL),
        "High" => Some(PRIORITY_HIGH),
        "Medium" => Some(PRIORITY_MEDIUM),
        "Low" => Some(PRIORITY_LOW),
        _ => None,
    }
}

/// Prefer Linear's explicit dueDate; fall back to the cycle end date.
fn compute_due_date(issue: &Issue) -> Option<DateTime<Utc>> {
    if let Some(date_str) = issue.due_date.as_deref()
        && let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        && let Some(dt) = date.and_hms_opt(0, 0, 0)
    {
        return Some(dt.and_utc());
    }
    issue.cycle.as_ref().and_then(|c| c.ends_at)
}

fn build_task_body(issue: &Issue) -> String {
    let mut out = String::new();

    if let Some(desc) = issue.description.as_deref()
        && !desc.trim().is_empty()
    {
        out.push_str(desc.trim_end());
        out.push_str("\n\n");
    }

    if !issue.attachments.nodes.is_empty() {
        out.push_str("## Attachments\n\n");
        for a in &issue.attachments.nodes {
            let title = if a.title.trim().is_empty() {
                a.url.as_str()
            } else {
                a.title.as_str()
            };
            let src = a
                .source
                .as_ref()
                .and_then(|s| s.get("type"))
                .and_then(|s| s.as_str());
            match src {
                Some(s) => out.push_str(&format!("- [{}]({}) — _{}_\n", title, a.url, s)),
                None => out.push_str(&format!("- [{}]({})\n", title, a.url)),
            }
        }
        out.push('\n');
    }

    if !issue.comments.nodes.is_empty() {
        out.push_str("## Comments\n\n");
        for (i, c) in issue.comments.nodes.iter().enumerate() {
            if i > 0 {
                out.push_str("---\n\n");
            }
            let who = c
                .user
                .as_ref()
                .and_then(|u| u.name.as_deref())
                .unwrap_or("Unknown");
            out.push_str(&format!(
                "**{}** — {}\n\n",
                who,
                c.created_at.format("%Y-%m-%d %H:%M UTC")
            ));
            out.push_str(c.body.trim_end());
            out.push_str("\n\n");
        }
    }

    out.trim_end().to_string()
}

fn build_property_values(issue: &Issue) -> Vec<Value> {
    let mut props = Vec::new();

    if let Some(state) = &issue.state
        && let Some(option_id) = map_status(&state.type_)
    {
        props.push(json!({
            "propertyId": STATUS_PROPERTY_ID,
            "value": { "type": "select_option", "option_id": option_id },
        }));
    }

    if let Some(label) = issue.priority_label.as_deref()
        && let Some(option_id) = map_priority(label)
    {
        props.push(json!({
            "propertyId": PRIORITY_PROPERTY_ID,
            "value": { "type": "select_option", "option_id": option_id },
        }));
    }

    if let Some(due) = compute_due_date(issue) {
        props.push(json!({
            "propertyId": DUE_DATE_PROPERTY_ID,
            "value": { "type": "date", "value": due.to_rfc3339() },
        }));
    }

    if let Some(est) = issue.estimate {
        props.push(json!({
            "propertyId": STORY_POINTS_PROPERTY_ID,
            "value": { "type": "number", "value": est },
        }));
    }

    props
}

fn print_planned_task(issue: &Issue) {
    let task_name = format!("[{}] {}", issue.identifier, issue.title);
    let body = build_task_body(issue);
    let props = build_property_values(issue);

    println!("  --- planned create_task payload ---");
    println!("  taskName: {}", task_name);
    if props.is_empty() {
        println!("  propertyValues: (none)");
    } else {
        println!("  propertyValues:");
        for p in &props {
            let property_id = p.get("propertyId").and_then(|v| v.as_str()).unwrap_or("?");
            let label = match property_id {
                STATUS_PROPERTY_ID => "status",
                PRIORITY_PROPERTY_ID => "priority",
                DUE_DATE_PROPERTY_ID => "dueDate",
                STORY_POINTS_PROPERTY_ID => "storyPoints",
                _ => "?",
            };
            let value = p.get("value").map(|v| v.to_string()).unwrap_or_default();
            println!("    - {} ({}): {}", label, property_id, value);
        }
    }
    if body.is_empty() {
        println!("  fileContent: (empty)");
    } else {
        println!("  fileContent (markdown):");
        println!("  ┌─────────────────────────────");
        for line in body.lines() {
            println!("  │ {}", line);
        }
        println!("  └─────────────────────────────");
    }
}

async fn create_macro_task(
    client: &reqwest::Client,
    base_url: &str,
    auth_key: &str,
    as_user: &str,
    issue: &Issue,
) -> Result<String> {
    let body = build_task_body(issue);
    let mut payload = json!({
        "taskName": format!("[{}] {}", issue.identifier, issue.title),
        "projectId": null,
        "propertyValues": build_property_values(issue),
        "shareWithTeam": true,
    });
    if !body.is_empty() {
        payload["fileContent"] = Value::String(body);
    }

    let url = format!(
        "{}/internal/documents/create_task",
        base_url.trim_end_matches('/')
    );

    let resp = client
        .post(&url)
        .header(MACRO_AUTH_HEADER, auth_key)
        .header(MACRO_USER_HEADER, as_user)
        .header("content-type", "application/json")
        .json(&payload)
        .send()
        .await
        .context("create_task request failed")?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        bail!("create_task http {}: {}", status, text);
    }

    let parsed: Value = serde_json::from_str(&text)
        .with_context(|| format!("parse create_task response: {}", text))?;
    let document_id = parsed
        .get("documentId")
        .and_then(|v| v.as_str())
        .with_context(|| format!("no documentId in response: {}", text))?;
    Ok(document_id.to_string())
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    let api_key = std::env::var("LINEAR_API_KEY").context("LINEAR_API_KEY env var not set")?;

    let macro_base_url = args
        .macro_base_url
        .clone()
        .or_else(|| std::env::var("MACRO_BASE_URL").ok());
    let auth_key = if args.dry_run {
        None
    } else {
        if macro_base_url.is_none() {
            bail!("--macro-base-url or MACRO_BASE_URL is required unless --dry-run");
        }
        if args.as_user.is_none() {
            bail!("--as-user is required unless --dry-run");
        }
        Some(
            std::env::var("MACRO_INTERNAL_AUTH_KEY")
                .context("MACRO_INTERNAL_AUTH_KEY env var not set")?,
        )
    };

    let updated_after = args
        .last_updated_window_days
        .map(|d| Utc::now() - Duration::days(d));

    let client = reqwest::Client::builder()
        .build()
        .context("build reqwest client")?;

    println!(
        "Args: only_not_done={}, last_updated_window_days={:?}, dry_run={}",
        args.only_not_done, args.last_updated_window_days, args.dry_run
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

    let mut created = 0usize;
    let mut failed = 0usize;
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

            if args.dry_run {
                print_planned_task(issue);
                continue;
            }
            let base_url = macro_base_url.as_deref().unwrap();
            let as_user = args.as_user.as_deref().unwrap();
            let auth = auth_key.as_deref().unwrap();
            match create_macro_task(&client, base_url, auth, as_user, issue).await {
                Ok(doc_id) => {
                    created += 1;
                    println!("  → created macro task {}", doc_id);
                }
                Err(e) => {
                    failed += 1;
                    println!("  → FAILED to create macro task: {:#}", e);
                }
            }
        }
    }

    if !args.dry_run {
        println!(
            "\nDone. Created {} tasks, {} failures across {} projects.",
            created,
            failed,
            projects.len()
        );
    }

    Ok(())
}
