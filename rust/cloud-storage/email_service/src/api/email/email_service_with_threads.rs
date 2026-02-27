use anyhow::Context;
use email::domain::{
    models::{EmailErr, EnrichedEmailThreadPreview, GetEmailsRequest, Link},
    ports::EmailService,
};
use macro_user_id::user_id::MacroUserIdStr;
use models_email::email::service::thread::APIThread;
use models_email::service::message::MessageWithBodyReplyless;
use models_pagination::{PaginatedCursor, SimpleSortMethod};
use models_permissions::share_permission::access_level::AccessLevel;
use sqlx::PgPool;
use uuid::Uuid;

/// Response from getting a thread with its messages.
#[derive(Debug, serde::Serialize)]
pub struct GetThreadResponse {
    /// The thread, with messages inside.
    pub thread: APIThread,
}

/// Wraps an inner `EmailService` implementation and adds `get_thread` support
/// by directly querying `email_db_client`.
#[derive(Clone)]
pub struct EmailServiceWithThreads<T> {
    pub inner: T,
    pub pool: PgPool,
}

impl<T: EmailService> EmailService for EmailServiceWithThreads<T> {
    type GetThreadResponse = GetThreadResponse;

    async fn get_email_thread_previews(
        &self,
        req: GetEmailsRequest,
    ) -> Result<PaginatedCursor<EnrichedEmailThreadPreview, Uuid, SimpleSortMethod, ()>, EmailErr>
    {
        self.inner.get_email_thread_previews(req).await
    }

    async fn get_link_by_macro_id(
        &self,
        macro_id: MacroUserIdStr<'_>,
    ) -> Result<Option<Link>, EmailErr> {
        self.inner.get_link_by_macro_id(macro_id).await
    }

    #[tracing::instrument(err, skip(self))]
    async fn get_thread(
        &self,
        thread_id: Uuid,
        access_level: AccessLevel,
        offset: i64,
        limit: i64,
    ) -> Result<GetThreadResponse, EmailErr> {
        let mut thread = email_db_client::threads::get::fetch_thread_with_messages_paginated(
            &self.pool, thread_id, offset, limit,
        )
        .await
        .context("Failed to fetch thread with messages")?
        .ok_or(EmailErr::NotFound)?;

        if access_level != AccessLevel::Owner {
            thread.messages.retain(|m| !m.is_draft);
        }

        let messages: Vec<MessageWithBodyReplyless> = thread
            .messages
            .iter()
            .cloned()
            .map(MessageWithBodyReplyless::from)
            .collect();

        let api_thread = APIThread::from_thread_with_messages(thread, messages, access_level);

        Ok(GetThreadResponse { thread: api_thread })
    }
}
