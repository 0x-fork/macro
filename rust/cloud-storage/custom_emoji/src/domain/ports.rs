//! Ports: the repository (outbound) and service (inbound) traits.

use macro_user_id::user_id::MacroUserIdStr;
use uuid::Uuid;

use crate::domain::model::{
    CreateCustomEmojiError, CustomEmoji, CustomEmojiError, DeleteCustomEmojiError,
};

/// Outbound port: persistence for custom emoji and the team-membership reads
/// needed to scope them.
pub trait CustomEmojiRepository: Clone + Send + Sync + 'static {
    /// Team ids the user belongs to (used to scope the autocomplete list).
    fn team_ids_for_user(
        &self,
        user_id: &MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Vec<Uuid>, CustomEmojiError>> + Send;

    /// Whether the user is a member of the given team.
    fn is_team_member(
        &self,
        user_id: &MacroUserIdStr<'_>,
        team_id: &Uuid,
    ) -> impl Future<Output = Result<bool, CustomEmojiError>> + Send;

    /// Inserts a new custom emoji and returns it.
    fn create(
        &self,
        team_id: &Uuid,
        slug: &str,
        sfs_file_id: &str,
        created_by: &MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<CustomEmoji, CreateCustomEmojiError>> + Send;

    /// Lists active (non-deleted) emoji for the given teams.
    fn list_for_teams(
        &self,
        team_ids: &[Uuid],
    ) -> impl Future<Output = Result<Vec<CustomEmoji>, CustomEmojiError>> + Send;

    /// Resolves emoji by id for rendering — includes soft-deleted rows so
    /// already-sent messages still render.
    fn resolve_by_ids(
        &self,
        ids: &[Uuid],
    ) -> impl Future<Output = Result<Vec<CustomEmoji>, CustomEmojiError>> + Send;

    /// Soft-deletes the emoji if it belongs to one of the caller's teams.
    /// Returns whether a row was deleted.
    fn soft_delete(
        &self,
        id: &Uuid,
        user_id: &MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<bool, DeleteCustomEmojiError>> + Send;
}

/// Inbound port: the operations the axum router calls.
pub trait CustomEmojiService: Clone + Send + Sync + 'static {
    /// Creates a custom emoji for a team the caller belongs to.
    fn create(
        &self,
        user_id: &MacroUserIdStr<'_>,
        team_id: &Uuid,
        slug: &str,
        sfs_file_id: &str,
    ) -> impl Future<Output = Result<CustomEmoji, CreateCustomEmojiError>> + Send;

    /// Lists the emoji available to the caller (union of their teams).
    fn list_for_user(
        &self,
        user_id: &MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Vec<CustomEmoji>, CustomEmojiError>> + Send;

    /// Resolves emoji by id for rendering (global; not team-gated).
    fn resolve(
        &self,
        ids: &[Uuid],
    ) -> impl Future<Output = Result<Vec<CustomEmoji>, CustomEmojiError>> + Send;

    /// Soft-deletes one of the caller's team emoji.
    fn delete(
        &self,
        user_id: &MacroUserIdStr<'_>,
        id: &Uuid,
    ) -> impl Future<Output = Result<(), DeleteCustomEmojiError>> + Send;
}
