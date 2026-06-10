#[cfg(test)]
mod test;

use super::{GENERATION_MODEL, MAX_AGE, MemoryServiceImpl, judge_memory};
use crate::domain::ports::*;
use agent::types::{ChatMessage, ChatMessageContent, Role};
use agent::{AgentLoop, StreamPart};
use ai_tools::ToolSetWithPrompt;
use chrono::Utc;
use futures::stream::StreamExt;
use macro_env::Environment;
use macro_user_id::user_id::MacroUserIdStr;
use macro_uuid::Uuid;
use std::sync::Arc;

static GENERATE_TEAM_MEMORY_PROMPT: &str = "\
Use tool calls to research the team identified in the system prompt: what the \
team does, who is on it, and what it is working on. Look at shared projects, \
documents, channels, and emails, and search for content created by team members.

Then generate a ~1000-3000 word memory about the team that will be prepended to \
future prompts for every member of the team. Focus on:
- What the team/company does and who its customers are
- Team members, their roles, and areas of ownership
- Current projects, priorities, and deadlines
- Shared domain knowledge, terminology, and conventions
- Recurring processes and how the team communicates and works together

Only include team-level context that is useful to every member of the team. \
Do not include personal details about individual members beyond their role on \
the team.

If a previous team memory is provided in the system prompt, use it as the \
baseline for the new memory. Preserve still-accurate durable facts, verify and \
update it with fresh tool research, add important new context, and remove \
obsolete or unsupported details.

Don't include things that would make sense to find via tool search at runtime. \
Focus on context that is useful as permanent background knowledge.

CRITICAL: Your response must contain ONLY the memory text. \
No preamble, no postscript, no commentary, no \"Let me...\", no \"Here is...\". \
Do not narrate your research process. Do not address the user. \
Just output the raw memory text starting with the first substantive line.";

static TEAM_JUDGE_PROMPT: &str = "\
You are a strict quality judge for AI-generated team memory profiles.

A \"team memory\" is a ~1000-3000 word summary of a team prepended to future AI \
prompts for every member of the team. A good team memory is built from rich data: \
documents the team wrote, projects it manages, emails and channel messages between \
members, and search results showing the team's work.

REJECT if ANY of the following are true:
- The memory is based on insufficient data (e.g. only a handful of chat titles, \
  no documents, no projects, no emails). A memory built from a nearly empty \
  workspace is useless speculation.
- It is mostly guesswork or hedged inferences (\"likely\", \"suggests\", \"may\") \
  rather than concrete facts derived from actual content.
- It is under ~500 words of substantive content.
- It lacks specific details about the team's actual work, projects, customers, \
  or processes.
- It is a profile of a single member rather than the team as a whole.
- It contains narration about the research process (\"I found...\", \"The workspace has...\").

ACCEPT only if the memory contains concrete, specific, actionable context derived \
from substantial workspace data (documents, code, projects, emails, messages) that \
would meaningfully improve future AI interactions for every member of the team.";

impl<Rpo, TRpo> MemoryServiceImpl<Rpo, TRpo>
where
    Rpo: MemoryRepo,
    TRpo: TeamMemoryRepo,
{
    /// Get the latest memory for the user's team, if the user belongs to one,
    /// triggering background regeneration when it is stale or missing.
    #[tracing::instrument(skip(self), err)]
    pub(super) async fn get_or_generate_team_memory(
        &self,
        user: MacroUserIdStr<'static>,
    ) -> crate::domain::Result<Option<Memory>> {
        let Some(team_id) = self.team_memory_repo.get_user_team_id(user.clone()).await? else {
            return Ok(None);
        };

        let record = self
            .team_memory_repo
            .get_latest_team_memory(team_id)
            .await?;

        let needs_generation = match &record {
            Some(r) => {
                let age = Utc::now() - r.updated_at;
                age > chrono::Duration::from_std(MAX_AGE).unwrap_or(chrono::TimeDelta::MAX)
            }
            None => true,
        };

        let env = Environment::new_or_prod();
        if needs_generation && !matches!(env, Environment::Local) {
            let pool = self.db.clone();
            let tool_context = self.tool_context.clone();
            let toolset = self.tools.toolset.clone();
            let prompt: Box<dyn std::fmt::Display + Send + Sync> =
                Box::new(self.tools.prompt.to_string());
            tokio::spawn(async move {
                // Unlike personal memory, every member of a (possibly large)
                // team can trigger a regeneration while one is already in
                // flight, so generations are serialized cross-instance via a
                // Postgres advisory lock.
                let _lock = match try_acquire_generation_lock(&pool, team_id).await {
                    Ok(Some(lock)) => lock,
                    Ok(None) => {
                        tracing::debug!(%team_id, "team memory generation already in progress");
                        return;
                    }
                    Err(e) => {
                        tracing::error!(error = ?e, %team_id, "failed to acquire team memory generation lock");
                        return;
                    }
                };
                let repo = crate::outbound::pg_memory_repo::PgMemoryRepo::new(pool.clone());
                let team_repo =
                    crate::outbound::pg_team_memory_repo::PgTeamMemoryRepo::new(pool.clone());

                // Re-check under the lock: another instance may have refreshed
                // the row between our staleness check and acquiring the lock, so
                // the lock deduplicates rather than merely serializing. Also read
                // `previous_memory` here so we diff against the freshest baseline.
                let latest = match team_repo.get_latest_team_memory(team_id).await {
                    Ok(latest) => latest,
                    Err(e) => {
                        tracing::error!(error = ?e, %team_id, "failed to reload latest team memory");
                        return;
                    }
                };
                let still_needs_generation = match &latest {
                    Some(r) => {
                        let age = Utc::now() - r.updated_at;
                        age > chrono::Duration::from_std(MAX_AGE).unwrap_or(chrono::TimeDelta::MAX)
                    }
                    None => true,
                };
                if !still_needs_generation {
                    tracing::debug!(%team_id, "team memory already refreshed; skipping");
                    return;
                }
                let previous_memory = latest.map(|r| r.memory);

                let tools = ToolSetWithPrompt { toolset, prompt };
                let svc = MemoryServiceImpl::new(pool, repo, team_repo, tool_context, tools);
                match svc
                    .generate_team_memory(team_id, user.clone(), previous_memory)
                    .await
                {
                    Ok(_) => tracing::info!(%team_id, "team memory generated"),
                    Err(MemoryError::Rejected(reason)) => {
                        tracing::warn!(%team_id, %reason, "team memory rejected by judge")
                    }
                    Err(e) => {
                        tracing::error!(%team_id, error = ?e, "team memory generation failed")
                    }
                }
            });
        }

        Ok(record.map(|r| r.memory))
    }

    /// Generate a fresh team memory by researching the team's workspace with
    /// the access of the `user` who triggered the refresh.
    #[tracing::instrument(skip(self), err)]
    async fn generate_team_memory(
        &self,
        team_id: Uuid,
        user: MacroUserIdStr<'static>,
        previous_memory: Option<Memory>,
    ) -> crate::domain::Result<Memory> {
        let overview = self
            .team_memory_repo
            .get_team_overview(team_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("team {team_id} does not exist"))?;

        let system_prompt = build_team_generation_system_prompt(
            &self.tools.prompt,
            &user,
            team_id,
            &overview,
            &Utc::now().to_rfc2822(),
            previous_memory.as_deref(),
        );

        let agent_loop = AgentLoop::new().with_model(GENERATION_MODEL);
        let toolset: Arc<dyn ai_toolset::ToolSet<_> + Send + Sync> =
            self.tools.toolset.clone() as _;
        let mut session = agent_loop
            .session(
                toolset,
                Arc::new(self.tool_context.clone()),
                &system_prompt,
                user.clone(),
            )
            .await;

        let user_msg = ChatMessage {
            content: ChatMessageContent::Text(GENERATE_TEAM_MEMORY_PROMPT.to_string()),
            role: Role::User,
            attachments: None,
        };
        let rig_messages = agent::to_rig_messages(&[user_msg]);

        let mut content = String::new();
        {
            let mut stream = session.send_message(rig_messages).await?;

            while let Some(next) = stream.next().await {
                let part = next?;
                if let StreamPart::Content(text) = part {
                    content.push_str(&text);
                }
            }
        }

        let memory = content.trim().to_string();
        if memory.is_empty() {
            return Err(MemoryError::NoGeneration);
        }

        // 2nd pass: judge the memory quality
        judge_memory(TEAM_JUDGE_PROMPT, &memory).await?;

        self.team_memory_repo
            .save_team_memory(&memory, team_id)
            .await?;
        Ok(memory)
    }
}

/// Try to take the cross-instance generation lock for a team.
///
/// Returns a connection holding a Postgres advisory lock, or `None` when
/// another generation for the same team already holds it. The connection is
/// detached from the pool so that dropping it closes the session, which
/// releases the lock even if the generation task panics.
async fn try_acquire_generation_lock(
    pool: &sqlx::PgPool,
    team_id: Uuid,
) -> crate::domain::Result<Option<sqlx::PgConnection>> {
    let mut conn = pool.acquire().await?.detach();
    let locked = sqlx::query_scalar!(
        r#"SELECT pg_try_advisory_lock(hashtextextended('team_memory:' || $1, 0)) as "locked!""#,
        team_id.to_string()
    )
    .fetch_one(&mut conn)
    .await?;

    Ok(locked.then_some(conn))
}

fn build_team_generation_system_prompt(
    base_prompt: impl std::fmt::Display,
    user: &MacroUserIdStr<'_>,
    team_id: Uuid,
    overview: &TeamOverview,
    datetime: &str,
    previous_memory: Option<&str>,
) -> String {
    let members = overview.member_ids.join(", ");
    let mut prompt = format!(
        "{base_prompt}\n<user_id>{user:?}</user_id>\n<team_id>{team_id}</team_id>\n<team_name>{name}</team_name>\n<team_members>{members}</team_members>\n<datetime>{datetime}</datetime>",
        name = overview.name,
    );

    if let Some(memory) = previous_memory {
        prompt.push_str("\n<previous_team_memory>\n");
        prompt.push_str(memory);
        prompt.push_str("\n</previous_team_memory>");
    }

    prompt
}
