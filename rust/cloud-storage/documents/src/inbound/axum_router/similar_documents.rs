//! Similar documents endpoint.

use axum::{
    Extension, Json,
    extract::{Path, State},
};
use entity_access::domain::models::MemberTeamRole;
use entity_access::domain::ports::EntityAccessService;
use entity_access::inbound::axum_extractors::{
    DocumentAccessExtractor, OptionalMacroUserTeamExtractor,
};
use model::document::DocumentBasic;
use model_user::axum_extractor::MacroUserExtractor;
use models_permissions::share_permission::access_level::ViewAccessLevel;
use serde::{Deserialize, Serialize};
use task_dedup::{EmbeddingMarkdown, SimilarDocument, SimilarDocumentsQuery};

use super::task_duplicates::task_dedup_error;
use super::{DocumentRouterState, Params};
use crate::domain::models::DocumentError;
use crate::domain::ports::DocumentService;

/// Response for similar document lookup.
#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct SimilarDocumentsResponse {
    /// Existing documents similar to the requested document, ordered from most
    /// to least relevant.
    pub results: Vec<SimilarDocument>,
}

/// Handler for `GET /documents/{document_id}/similar_documents`.
///
/// Returns existing documents similar to the one being viewed, using the same
/// embed → vector search → rerank pipeline as task duplicate detection but
/// over the document embedding store. Nothing is judged or persisted beyond
/// the viewed document's own embedding, which is refreshed as a side effect so
/// the corpus keeps itself up to date.
#[utoipa::path(
    tag = "document",
    get,
    path = "/documents/{document_id}/similar_documents",
    params(("document_id" = String, Path, description = "Document id")),
    responses(
        (status = 200, body = inline(SimilarDocumentsResponse)),
        (status = 401, body = model_error_response::ErrorResponse),
        (status = 404, body = model_error_response::ErrorResponse),
        (status = 500, body = model_error_response::ErrorResponse),
    )
)]
#[tracing::instrument(skip(state, _access, user, optional_team, doc), fields(user_id=?user.macro_user_id), err)]
pub async fn get_similar_documents_handler<T: DocumentService, Svc: EntityAccessService>(
    _access: DocumentAccessExtractor<ViewAccessLevel, Svc>,
    State(state): State<DocumentRouterState<T, Svc>>,
    user: MacroUserExtractor,
    optional_team: OptionalMacroUserTeamExtractor<MemberTeamRole, Svc>,
    doc: Extension<DocumentBasic>,
    Path(Params { document_id }): Path<Params>,
) -> Result<Json<SimilarDocumentsResponse>, DocumentError> {
    // Only plain markdown documents participate: tasks and snippets have their
    // own surfaces, and other file types have no markdown body to embed.
    if doc.sub_type.is_some() || doc.file_type.as_deref() != Some("md") {
        return Ok(Json(SimilarDocumentsResponse {
            results: Vec::new(),
        }));
    }

    // Like task duplicate search, scope to the user's whole team rather than
    // just their own documents. Users without a team fall back to
    // owner-plus-direct-shares scope.
    let team_id = optional_team
        .entity_access_receipt
        .map(|team| macro_uuid::string_to_uuid(&team.entity().entity_id).unwrap());

    // A document whose body cannot be fetched still gets a title-only search
    // rather than an error: the panel is best-effort.
    let markdown = match state
        .lexical_client
        .get_embedding_markdown(&document_id)
        .await
    {
        Ok(markdown) => markdown,
        Err(error) => {
            tracing::warn!(
                error=?error,
                document_id=%document_id,
                "failed to fetch embedding markdown for similar documents; searching title only"
            );
            EmbeddingMarkdown::empty()
        }
    };

    let results = state
        .document_similarity_service
        .similar_documents(SimilarDocumentsQuery {
            document_id,
            user: user.macro_user_id.as_ref().to_string(),
            team_id,
            title: doc.document_name.clone(),
            markdown,
        })
        .await
        .map_err(task_dedup_error)?;

    Ok(Json(SimilarDocumentsResponse { results }))
}
