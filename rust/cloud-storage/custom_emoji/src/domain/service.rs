//! Service implementation orchestrating the repository.

use macro_user_id::user_id::MacroUserIdStr;
use uuid::Uuid;

use crate::domain::model::{
    CreateCustomEmojiError, CustomEmoji, CustomEmojiError, DeleteCustomEmojiError,
};
use crate::domain::ports::{CustomEmojiRepository, CustomEmojiService};

/// Max slug length (kept in sync with the `team_custom_emoji.slug` column).
const MAX_SLUG_LEN: usize = 32;

/// Concrete [`CustomEmojiService`] backed by a [`CustomEmojiRepository`].
#[derive(Debug, Clone)]
pub struct CustomEmojiServiceImpl<R: CustomEmojiRepository> {
    repo: R,
}

impl<R: CustomEmojiRepository> CustomEmojiServiceImpl<R> {
    /// Creates a new service from a repository.
    pub fn new(repo: R) -> Self {
        Self { repo }
    }
}

/// Validates a slug: 1..=32 chars, lowercase alphanumeric / `_` / `-`, and may
/// not start with `_` or `-`. Mirrors the DB CHECK constraint.
fn validate_slug(slug: &str) -> Result<(), CreateCustomEmojiError> {
    let valid = !slug.is_empty()
        && slug.len() <= MAX_SLUG_LEN
        && slug.bytes().enumerate().all(|(i, b)| match b {
            b'a'..=b'z' | b'0'..=b'9' => true,
            b'_' | b'-' => i != 0,
            _ => false,
        });
    if valid {
        Ok(())
    } else {
        Err(CreateCustomEmojiError::InvalidSlug(slug.to_string()))
    }
}

impl<R: CustomEmojiRepository> CustomEmojiService for CustomEmojiServiceImpl<R> {
    #[tracing::instrument(skip(self), err)]
    async fn create(
        &self,
        user_id: &MacroUserIdStr<'_>,
        team_id: &Uuid,
        slug: &str,
        sfs_file_id: &str,
    ) -> Result<CustomEmoji, CreateCustomEmojiError> {
        validate_slug(slug)?;
        if !self.repo.is_team_member(user_id, team_id).await? {
            return Err(CreateCustomEmojiError::NotTeamMember(*team_id));
        }
        self.repo.create(team_id, slug, sfs_file_id, user_id).await
    }

    #[tracing::instrument(skip(self), err)]
    async fn list_for_user(
        &self,
        user_id: &MacroUserIdStr<'_>,
    ) -> Result<Vec<CustomEmoji>, CustomEmojiError> {
        let team_ids = self.repo.team_ids_for_user(user_id).await?;
        if team_ids.is_empty() {
            return Ok(Vec::new());
        }
        self.repo.list_for_teams(&team_ids).await
    }

    #[tracing::instrument(skip(self), err)]
    async fn resolve(&self, ids: &[Uuid]) -> Result<Vec<CustomEmoji>, CustomEmojiError> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        self.repo.resolve_by_ids(ids).await
    }

    #[tracing::instrument(skip(self), err)]
    async fn delete(
        &self,
        user_id: &MacroUserIdStr<'_>,
        id: &Uuid,
    ) -> Result<(), DeleteCustomEmojiError> {
        if self.repo.soft_delete(id, user_id).await? {
            Ok(())
        } else {
            Err(DeleteCustomEmojiError::NotFound)
        }
    }
}
