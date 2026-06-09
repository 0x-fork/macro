//! Axum router exposing Google Drive browse + import endpoints.
//!
//! Mounted by `document_storage_service` under an authenticated, user-context
//! aware path (e.g. `/internal/google-drive`). Routes:
//! - `GET  /files`      — list the children of a Drive folder (picker).
//! - `POST /import`     — import the selected Drive files/folders into Macro.
//! - `GET  /connection` — whether the user has connected Drive.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use model_error_response::ErrorResponse;
use model_user::axum_extractor::MacroUserExtractor;
use serde::{Deserialize, Serialize};

use crate::domain::models::{DriveFileList, GoogleDriveError, ImportRequest, ImportResult};
use crate::domain::ports::GoogleDriveService;

/// Router state holding the Google Drive service.
pub struct GoogleDriveRouterState<S> {
    /// The Google Drive service implementation.
    pub service: Arc<S>,
}

// Manual Clone so `S` need not be `Clone` (it lives behind an `Arc`).
impl<S> Clone for GoogleDriveRouterState<S> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
        }
    }
}

/// Build the Google Drive router.
pub fn google_drive_router<S, St>(state: GoogleDriveRouterState<S>) -> Router<St>
where
    S: GoogleDriveService,
    St: Send + Sync + Clone + 'static,
{
    Router::new()
        .route("/files", get(list_files_handler::<S>))
        .route("/import", post(import_handler::<S>))
        .route("/connection", get(connection_handler::<S>))
        .with_state(state)
}

/// Query params for browsing a folder.
#[derive(Debug, Deserialize)]
pub struct ListFilesQuery {
    /// The Drive folder id to list. Omitted lists the user's Drive root.
    #[serde(default)]
    pub parent_id: Option<String>,
    /// Opaque pagination cursor from a previous response.
    #[serde(default)]
    pub page_token: Option<String>,
}

/// Whether the authenticated user has connected Google Drive.
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct DriveConnectionResponse {
    /// `true` once the user has a Drive link.
    pub connected: bool,
}

/// List the children of a Drive folder for the picker UI.
#[utoipa::path(
    get,
    path = "/google-drive/files",
    operation_id = "list_google_drive_files",
    params(
        ("parent_id" = Option<String>, Query, description = "Drive folder id; omitted = root"),
        ("page_token" = Option<String>, Query, description = "Pagination cursor"),
    ),
    responses(
        (status = 200, body = DriveFileList),
        (status = 412, description = "Drive not connected", body = ErrorResponse),
        (status = 428, description = "Reauthentication required", body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user), fields(user_id = %user.macro_user_id), err)]
async fn list_files_handler<S: GoogleDriveService>(
    State(ctx): State<GoogleDriveRouterState<S>>,
    user: MacroUserExtractor,
    Query(query): Query<ListFilesQuery>,
) -> Result<Json<DriveFileList>, DriveApiError> {
    let macro_user_id = user.macro_user_id.to_string();
    let files = ctx
        .service
        .list_children(
            &macro_user_id,
            query.parent_id.as_deref(),
            query.page_token.as_deref(),
        )
        .await?;
    Ok(Json(files))
}

/// Import selected Drive files/folders into Macro.
#[utoipa::path(
    post,
    path = "/google-drive/import",
    operation_id = "import_google_drive",
    request_body = ImportRequest,
    responses(
        (status = 200, body = ImportResult),
        (status = 412, description = "Drive not connected", body = ErrorResponse),
        (status = 428, description = "Reauthentication required", body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user, request), fields(user_id = %user.macro_user_id), err)]
async fn import_handler<S: GoogleDriveService>(
    State(ctx): State<GoogleDriveRouterState<S>>,
    user: MacroUserExtractor,
    Json(request): Json<ImportRequest>,
) -> Result<Json<ImportResult>, DriveApiError> {
    let macro_user_id = user.macro_user_id.to_string();
    let result = ctx.service.import(&macro_user_id, request).await?;
    Ok(Json(result))
}

/// Report whether the user has connected Google Drive.
#[utoipa::path(
    get,
    path = "/google-drive/connection",
    operation_id = "google_drive_connection_status",
    responses(
        (status = 200, body = DriveConnectionResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user), fields(user_id = %user.macro_user_id), err)]
async fn connection_handler<S: GoogleDriveService>(
    State(ctx): State<GoogleDriveRouterState<S>>,
    user: MacroUserExtractor,
) -> Result<Json<DriveConnectionResponse>, DriveApiError> {
    let macro_user_id = user.macro_user_id.to_string();
    let connected = ctx.service.is_connected(&macro_user_id).await?;
    Ok(Json(DriveConnectionResponse { connected }))
}

/// Wraps [`GoogleDriveError`] so it can be returned from Axum handlers.
pub struct DriveApiError(GoogleDriveError);

impl From<GoogleDriveError> for DriveApiError {
    fn from(error: GoogleDriveError) -> Self {
        Self(error)
    }
}

impl IntoResponse for DriveApiError {
    fn into_response(self) -> Response {
        let (status, message): (StatusCode, &str) = match &self.0 {
            GoogleDriveError::NoLinkFound => (
                StatusCode::PRECONDITION_FAILED,
                "google drive is not connected",
            ),
            GoogleDriveError::ReauthenticationRequired => (
                StatusCode::PRECONDITION_REQUIRED,
                "google drive reauthentication required",
            ),
            GoogleDriveError::NotFound => {
                (StatusCode::NOT_FOUND, "google drive resource not found")
            }
            GoogleDriveError::DriveApi(_) => {
                (StatusCode::BAD_GATEWAY, "google drive request failed")
            }
            GoogleDriveError::Internal(error) => {
                tracing::error!(error = ?error, "google drive internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error occurred")
            }
        };

        (
            status,
            Json(ErrorResponse {
                message: message.into(),
            }),
        )
            .into_response()
    }
}
