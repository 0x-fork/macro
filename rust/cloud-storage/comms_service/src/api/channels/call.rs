use anyhow::Result;
use axum::{Json, extract::State, http::StatusCode};
use model::response::GenericSuccessResponse;

use crate::{
    api::{
        context::AppState,
        extractors::{ChannelId, ChannelMember},
    },
    service::{
        livekit::{ChannelCallState, CreateChannelCallRequest, JoinChannelCallResponse},
        sender::notify::{CallStateData, notify_call_state},
    },
};

#[utoipa::path(
    get,
    path = "/comms/channels/{channel_id}/call",
    tag = "channels",
    operation_id = "get_channel_call",
    params(
        ("channel_id" = String, Path, description = "id of the channel")
    ),
    responses(
        (status = 200, body = ChannelCallState),
        (status = 401, body = String),
        (status = 503, body = String),
        (status = 500, body = String),
    )
)]
pub async fn get_channel_call_handler(
    State(ctx): State<AppState>,
    ChannelId(channel_id): ChannelId,
    _channel_member: ChannelMember,
) -> Result<(StatusCode, Json<ChannelCallState>), (StatusCode, String)> {
    let livekit = ctx.livekit_service.as_ref().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "calling is not configured".to_string(),
    ))?;

    let state = livekit.get_call_state(channel_id).await.map_err(|err| {
        tracing::error!(error=?err, channel_id=%channel_id, "failed to fetch channel call state");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to fetch channel call state".to_string(),
        )
    })?;

    Ok((StatusCode::OK, Json(state)))
}

#[utoipa::path(
    post,
    path = "/comms/channels/{channel_id}/call",
    tag = "channels",
    operation_id = "create_channel_call",
    params(
        ("channel_id" = String, Path, description = "id of the channel")
    ),
    request_body = CreateChannelCallRequest,
    responses(
        (status = 200, body = JoinChannelCallResponse),
        (status = 401, body = String),
        (status = 503, body = String),
        (status = 500, body = String),
    )
)]
pub async fn create_channel_call_handler(
    State(ctx): State<AppState>,
    ChannelId(channel_id): ChannelId,
    channel_member: ChannelMember,
    Json(request): Json<CreateChannelCallRequest>,
) -> Result<(StatusCode, Json<JoinChannelCallResponse>), (StatusCode, String)> {
    let livekit = ctx.livekit_service.as_ref().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "calling is not configured".to_string(),
    ))?;

    let response = livekit
        .ensure_call(channel_id, channel_member.0.user_id.as_ref(), request.call_type)
        .await
        .map_err(|err| {
            tracing::error!(error=?err, channel_id=%channel_id, "failed to create or join channel call");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to create or join channel call".to_string(),
            )
        })?;

    if let Err(err) = notify_call_state(
        &ctx,
        CallStateData {
            channel_id: &channel_id,
        },
    )
    .await
    {
        tracing::warn!(error=?err, channel_id=%channel_id, "failed to broadcast channel call refresh");
    }

    Ok((StatusCode::OK, Json(response)))
}

#[utoipa::path(
    delete,
    path = "/comms/channels/{channel_id}/call",
    tag = "channels",
    operation_id = "end_channel_call",
    params(
        ("channel_id" = String, Path, description = "id of the channel")
    ),
    responses(
        (status = 200, body = GenericSuccessResponse),
        (status = 401, body = String),
        (status = 503, body = String),
        (status = 500, body = String),
    )
)]
pub async fn end_channel_call_handler(
    State(ctx): State<AppState>,
    ChannelId(channel_id): ChannelId,
    _channel_member: ChannelMember,
) -> Result<(StatusCode, Json<GenericSuccessResponse>), (StatusCode, String)> {
    let livekit = ctx.livekit_service.as_ref().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "calling is not configured".to_string(),
    ))?;

    let deleted = livekit.end_call(channel_id).await.map_err(|err| {
        tracing::error!(error=?err, channel_id=%channel_id, "failed to end channel call");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to end channel call".to_string(),
        )
    })?;

    if let Err(err) = notify_call_state(
        &ctx,
        CallStateData {
            channel_id: &channel_id,
        },
    )
    .await
    {
        tracing::warn!(error=?err, channel_id=%channel_id, "failed to broadcast channel call refresh");
    }

    Ok((
        StatusCode::OK,
        Json(GenericSuccessResponse { success: deleted }),
    ))
}
