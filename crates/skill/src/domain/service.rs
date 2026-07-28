//! Default [`SkillQueryService`] and [`SkillCreationService`] implementations.

use attachment::{Attachable, AttachmentContent, AttachmentService, TextOrImage};
use documents::domain::create::{
    DocumentCreator, MarkdownSubtype, NewDocumentMetadata, NewMarkdownTextDocument,
};
use documents::domain::ports::create::{DocumentBytesUploadPort, DocumentCreationService};
use documents::domain::ports::markdown::MarkdownInitializationPort;
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::{Entity, EntityType};
use non_empty::NonEmpty;

use crate::domain::models::{CreateSkillArgs, ResolvedSkillContent, Result, Skill};
use crate::domain::ports::{SkillCreationService, SkillQueryService, SkillRepo};

/// Concrete [`SkillQueryService`] backed by a [`SkillRepo`] and an
/// [`AttachmentService`].
pub struct SkillServiceImpl<Repo, Attach> {
    repo: Repo,
    attachment_service: Attach,
}

impl<Repo, Attach> SkillServiceImpl<Repo, Attach> {
    /// Create a new skill query service.
    pub fn new(repo: Repo, attachment_service: Attach) -> Self {
        Self {
            repo,
            attachment_service,
        }
    }
}

impl<Repo, Attach> SkillQueryService for SkillServiceImpl<Repo, Attach>
where
    Repo: SkillRepo,
    Attach: AttachmentService,
{
    #[tracing::instrument(err, skip(self))]
    async fn list_skills(&self, user_id: &MacroUserIdStr<'_>) -> Result<Vec<Skill>> {
        self.repo.list_skills(user_id).await
    }

    #[tracing::instrument(err, skip(self))]
    async fn search_skills(&self, user_id: &MacroUserIdStr<'_>, query: &str) -> Result<Vec<Skill>> {
        self.repo.search_skills(user_id, query).await
    }

    #[tracing::instrument(err, skip(self, skill_ids))]
    async fn resolve_skills(
        &self,
        user_id: &MacroUserIdStr<'_>,
        skill_ids: &[String],
    ) -> Result<Vec<ResolvedSkillContent>> {
        if skill_ids.is_empty() {
            return Ok(vec![]);
        }

        let entities: Vec<Entity<'static>> = skill_ids
            .iter()
            .map(|id| EntityType::Document.with_entity_string(id.clone()))
            .collect();
        let entity_refs: Vec<&Entity<'_>> = entities.iter().collect();
        let non_empty = NonEmpty::new(entity_refs.as_slice()).expect("checked non-empty above");

        let resolved = self
            .attachment_service
            .resolve_attachments(user_id.clone(), non_empty)
            .await;

        Ok(resolved
            .into_parts()
            .into_inner()
            .into_iter()
            .map(|result| match result {
                Ok(content) => ResolvedSkillContent {
                    name: content.name.clone(),
                    content: attachment_content_to_text(content),
                },
                Err(e) => ResolvedSkillContent {
                    name: None,
                    content: format!("failed to resolve skill: {}", e.error),
                },
            })
            .collect())
    }
}

/// Concrete [`SkillCreationService`] backed by the `documents` crate's
/// [`DocumentCreator`].
pub struct SkillCreator<Svc, MarkdownInit, BytesUpload> {
    creator: DocumentCreator<Svc, MarkdownInit, BytesUpload>,
}

impl<Svc, MarkdownInit, BytesUpload> SkillCreator<Svc, MarkdownInit, BytesUpload> {
    /// Create a new skill creator wrapping a `documents`-crate
    /// [`DocumentCreator`].
    pub fn new(creator: DocumentCreator<Svc, MarkdownInit, BytesUpload>) -> Self {
        Self { creator }
    }
}

impl<Svc, MarkdownInit, BytesUpload> SkillCreationService
    for SkillCreator<Svc, MarkdownInit, BytesUpload>
where
    Svc: DocumentCreationService + 'static,
    MarkdownInit: MarkdownInitializationPort + 'static,
    BytesUpload: DocumentBytesUploadPort + 'static,
{
    #[tracing::instrument(err, skip(self, args))]
    async fn create_skill(
        &self,
        user_id: MacroUserIdStr<'static>,
        args: CreateSkillArgs,
    ) -> Result<Skill> {
        let name = args.name.clone();
        let mut metadata = NewDocumentMetadata::builder(args.name);
        if let Some(project_id) = args.project_id {
            metadata = metadata.project_id(project_id);
        }

        let created = self
            .creator
            .create_markdown_text(
                user_id,
                NewMarkdownTextDocument {
                    metadata: metadata.build(),
                    markdown: args.markdown.unwrap_or_default(),
                    subtype: MarkdownSubtype::Skill,
                },
            )
            .await
            .map_err(|e| rootcause::report!("failed to create skill document: {e}"))?;

        Ok(Skill {
            document_id: created.document_id().to_string(),
            name,
        })
    }
}

/// Flattens an attachment's content parts into plain text, dropping any
/// images — this feeds a text-only system prompt section, not a multimodal
/// message body.
fn attachment_content_to_text(content: AttachmentContent<'_>) -> String {
    content
        .content
        .into_formatted_parts()
        .into_parts()
        .into_inner()
        .into_iter()
        .filter_map(|part| match part {
            TextOrImage::Text(text) => Some(text),
            TextOrImage::Image(_) => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}
