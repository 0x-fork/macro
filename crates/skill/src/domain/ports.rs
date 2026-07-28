//! Ports for the skill domain.
//!
//! Split into a read side ([`SkillQueryService`], backed by [`SkillRepo`] and
//! an [`attachment::AttachmentService`]) and a write side
//! ([`SkillCreationService`], backed by the `documents` crate's document
//! creation lifecycle). Consumers that only need to discover/read skills
//! (e.g. the AI toolset, prompt injection) depend on the query side only,
//! without pulling in document-creation machinery they never call.

use std::future::Future;

use macro_user_id::user_id::MacroUserIdStr;

use crate::domain::models::{CreateSkillArgs, ResolvedSkillContent, Result, Skill};

/// Repository port for listing/searching skill documents.
pub trait SkillRepo: Send + Sync + 'static {
    /// List the user's skill documents, most recently updated first.
    fn list_skills(
        &self,
        user_id: &MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Vec<Skill>>> + Send;

    /// Search the user's skill documents by name.
    fn search_skills(
        &self,
        user_id: &MacroUserIdStr<'_>,
        query: &str,
    ) -> impl Future<Output = Result<Vec<Skill>>> + Send;
}

/// Service trait for reading skills — listing, searching, and resolving
/// attached skills' content. Used by the AI toolset and by the AI chat
/// send-endpoint's prompt-injection step.
pub trait SkillQueryService: Send + Sync + 'static {
    /// List the user's skill documents.
    fn list_skills(
        &self,
        user_id: &MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Vec<Skill>>> + Send;

    /// Search the user's skill documents by name — used by the AI chat
    /// slash-command menu and the `SearchSkills` AI tool.
    fn search_skills(
        &self,
        user_id: &MacroUserIdStr<'_>,
        query: &str,
    ) -> impl Future<Output = Result<Vec<Skill>>> + Send;

    /// Resolve a batch of skill document ids into plain-text content, ready
    /// to be injected into the AI system prompt.
    fn resolve_skills(
        &self,
        user_id: &MacroUserIdStr<'_>,
        skill_ids: &[String],
    ) -> impl Future<Output = Result<Vec<ResolvedSkillContent>>> + Send;
}

/// Service trait for creating skills. Used by the `POST /skill/create_skill`
/// endpoint.
pub trait SkillCreationService: Send + Sync + 'static {
    /// Create a new skill document owned by `user_id`.
    fn create_skill(
        &self,
        user_id: MacroUserIdStr<'static>,
        args: CreateSkillArgs,
    ) -> impl Future<Output = Result<Skill>> + Send;
}
