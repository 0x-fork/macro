//! Connects an arbitrary email server as an inbox via IMAP (receive) and
//! SMTP (send), the "bring your own server" counterpart of the Gmail OAuth
//! init flow.

use crate::api::ApiContext;
use anyhow::Context;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json, Response};
use email_service::util::imap::{encrypt_credentials, require_credential_key};
use imap_smtp_client::ImapSession;
use macro_user_id::email::EmailStr;
use model::response::ErrorResponse;
use model::user::axum_extractor::MacroUserExtractor;
use models_email::gmail::inbox_sync::{
    ImapPollPayload, InboxSyncOperation, InboxSyncPubsubMessage,
};
use models_email::service::imap::{ConnectionSecurity, ServerSettings};
use models_email::service::link;
use std::time::Duration;
use strum_macros::AsRefStr;
use thiserror::Error;
use utoipa::ToSchema;
use uuid::Uuid;

/// How long we give each of the IMAP/SMTP verification handshakes before
/// telling the user their server is unreachable.
const VERIFY_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Error, AsRefStr)]
pub enum CreateImapLinkError {
    #[error("An inbox for this email address is already connected")]
    AlreadyInitialized,

    #[error("Invalid input: {0}")]
    BadRequest(String),

    #[error("Could not connect to the IMAP server: {0}")]
    ImapVerificationFailed(String),

    #[error("Could not connect to the SMTP server: {0}")]
    SmtpVerificationFailed(String),

    #[error("IMAP/SMTP accounts are not enabled for this deployment")]
    NotConfigured,

    #[error("Internal error")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for CreateImapLinkError {
    fn into_response(self) -> Response {
        let status_code = match &self {
            CreateImapLinkError::AlreadyInitialized
            | CreateImapLinkError::BadRequest(_)
            | CreateImapLinkError::ImapVerificationFailed(_)
            | CreateImapLinkError::SmtpVerificationFailed(_) => StatusCode::BAD_REQUEST,
            CreateImapLinkError::NotConfigured => StatusCode::NOT_IMPLEMENTED,
            CreateImapLinkError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        (status_code, self.to_string()).into_response()
    }
}

/// Connection settings for one server (the IMAP or SMTP half).
#[derive(Debug, serde::Serialize, serde::Deserialize, ToSchema)]
pub struct ServerSettingsInput {
    /// Server hostname, e.g. `imap.fastmail.com`.
    pub host: String,
    /// Server port, e.g. 993 for IMAP over TLS, 465/587 for SMTP.
    pub port: u16,
    /// How the connection is secured.
    pub security: ConnectionSecurity,
    /// Login username (usually the email address).
    pub username: String,
    /// Login password. Many providers require an app-specific password.
    pub password: String,
}

impl ServerSettingsInput {
    fn into_settings(self) -> Result<ServerSettings, CreateImapLinkError> {
        let host = self.host.trim().to_string();
        if host.is_empty() {
            return Err(CreateImapLinkError::BadRequest(
                "server host must not be empty".to_string(),
            ));
        }
        if self.port == 0 {
            return Err(CreateImapLinkError::BadRequest(
                "server port must not be 0".to_string(),
            ));
        }
        if self.username.is_empty() || self.password.is_empty() {
            return Err(CreateImapLinkError::BadRequest(
                "username and password must not be empty".to_string(),
            ));
        }
        Ok(ServerSettings {
            host,
            port: self.port,
            security: self.security,
            username: self.username,
            password: self.password,
        })
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, ToSchema)]
pub struct CreateImapLinkRequest {
    /// The mailbox address being connected.
    pub email_address: String,
    /// IMAP (receiving) server settings.
    pub imap: ServerSettingsInput,
    /// SMTP (sending) server settings.
    pub smtp: ServerSettingsInput,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, ToSchema)]
pub struct CreateImapLinkResponse {
    /// The email_links row id for the newly connected inbox.
    pub link_id: Uuid,
}

/// Connects an email account on an arbitrary IMAP/SMTP server as an inbox.
///
/// Verifies both server connections with the supplied credentials before
/// persisting anything; passwords are stored encrypted. On success an initial
/// sync of the inbox is scheduled.
#[utoipa::path(
    post,
    tag = "Links",
    path = "/email/links/imap",
    operation_id = "create_imap_link",
    request_body = CreateImapLinkRequest,
    responses(
            (status = 200, body=CreateImapLinkResponse),
            (status = 400, body=ErrorResponse),
            (status = 401, body=ErrorResponse),
            (status = 500, body=ErrorResponse),
            (status = 501, body=ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user_extractor, request), fields(user_id=user_extractor.user_context.user_id), err)]
pub async fn create_imap_link_handler(
    State(ctx): State<ApiContext>,
    user_extractor: MacroUserExtractor,
    Json(request): Json<CreateImapLinkRequest>,
) -> Result<Response, CreateImapLinkError> {
    let MacroUserExtractor {
        macro_user_id,
        user_context,
        ..
    } = user_extractor;

    let key = require_credential_key(&ctx.credential_key)
        .map_err(|_| CreateImapLinkError::NotConfigured)?;

    let email_address = EmailStr::try_from(request.email_address.trim().to_lowercase())
        .map_err(|e| CreateImapLinkError::BadRequest(format!("invalid email address: {e}")))?;

    let imap = request.imap.into_settings()?;
    let smtp = request.smtp.into_settings()?;

    let existing = email_db_client::links::get::fetch_link_by_email(
        &ctx.db,
        email_address.0.as_ref(),
        link::UserProvider::ImapSmtp,
    )
    .await
    .context("failed to check for existing link")?;
    if existing.is_some() {
        return Err(CreateImapLinkError::AlreadyInitialized);
    }

    // Validate both connections before persisting anything so the user gets
    // immediate, specific feedback on which half is misconfigured.
    tokio::time::timeout(VERIFY_TIMEOUT, ImapSession::verify(&imap))
        .await
        .map_err(|_| {
            CreateImapLinkError::ImapVerificationFailed(format!(
                "timed out connecting to {}:{}",
                imap.host, imap.port
            ))
        })?
        .map_err(|e| CreateImapLinkError::ImapVerificationFailed(format!("{e:#}")))?;

    tokio::time::timeout(VERIFY_TIMEOUT, imap_smtp_client::smtp::verify(&smtp))
        .await
        .map_err(|_| {
            CreateImapLinkError::SmtpVerificationFailed(format!(
                "timed out connecting to {}:{}",
                smtp.host, smtp.port
            ))
        })?
        .map_err(|e| CreateImapLinkError::SmtpVerificationFailed(format!("{e:#}")))?;

    let new_link = link::Link {
        id: macro_uuid::generate_uuid_v7(),
        macro_id: macro_user_id,
        fusionauth_user_id: user_context.fusion_user_id.clone(),
        email_address,
        provider: link::UserProvider::ImapSmtp,
        is_sync_active: true,
        created_at: Default::default(),
        updated_at: Default::default(),
    };

    let mut tx = ctx
        .db
        .begin()
        .await
        .context("failed to begin link transaction")?;

    let inserted = email_db_client::links::insert::upsert_link(&mut tx, new_link)
        .await
        .context("failed to upsert link")?;

    let credentials = encrypt_credentials(key, inserted.id, &imap, &smtp)
        .context("failed to encrypt credentials")?;
    email_db_client::imap::upsert_credentials(&mut *tx, &credentials)
        .await
        .context("failed to store credentials")?;

    tx.commit()
        .await
        .context("failed to commit link transaction")?;

    // Record link creation in history table for tracking (best-effort)
    email_db_client::links_history::insert::insert_email_link_history(
        &ctx.db,
        inserted.id,
        &inserted.fusionauth_user_id,
        inserted.email_address.0.as_ref(),
        inserted.provider,
    )
    .await
    .inspect_err(|e| {
        tracing::error!(error=?e, link_id=?inserted.id, "Failed to insert email link history");
    })
    .ok();

    // Seed the inbox with recent mail; subsequent polls are scheduled by the
    // link refresh cycle.
    ctx.sqs_client
        .enqueue_gmail_inbox_sync_notification(InboxSyncPubsubMessage {
            link_id: inserted.id,
            operation: InboxSyncOperation::ImapPoll(ImapPollPayload { initial: true }),
        })
        .await
        .context("failed to enqueue initial IMAP sync")?;

    Ok((
        StatusCode::OK,
        Json(CreateImapLinkResponse {
            link_id: inserted.id,
        }),
    )
        .into_response())
}
