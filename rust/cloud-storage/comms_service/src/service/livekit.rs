use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use livekit_api::{
    access_token::{AccessToken, VideoGrants},
    services::{
        ServiceError, TwirpError, TwirpErrorCode,
        room::{CreateRoomOptions, RoomClient},
    },
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

const DEFAULT_EMPTY_TIMEOUT_SECONDS: u32 = 30;
const DEFAULT_DEPARTURE_TIMEOUT_SECONDS: u32 = 20;
const DEFAULT_MAX_PARTICIPANTS: u32 = 64;
const DEFAULT_TOKEN_TTL_SECONDS: u64 = 60 * 60 * 2;

#[derive(Debug, Clone)]
pub struct LiveKitConfig {
    pub api_url: String,
    pub ws_url: String,
    pub api_key: String,
    pub api_secret: String,
    pub room_prefix: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChannelCallType {
    Voice,
    Video,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChannelCallStatus {
    Inactive,
    Active,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq, Eq)]
pub struct ChannelCallParticipant {
    pub identity: String,
    pub name: Option<String>,
    pub metadata: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq, Eq)]
pub struct ChannelCallState {
    pub channel_id: Uuid,
    pub status: ChannelCallStatus,
    pub room_name: Option<String>,
    pub call_type: Option<ChannelCallType>,
    pub started_at: Option<DateTime<Utc>>,
    pub created_by: Option<String>,
    pub participant_count: usize,
    pub participants: Vec<ChannelCallParticipant>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateChannelCallRequest {
    pub call_type: ChannelCallType,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct JoinChannelCallResponse {
    pub call: ChannelCallState,
    pub room_name: String,
    pub server_url: String,
    pub token: String,
    pub participant_identity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct RoomMetadata {
    call_type: Option<ChannelCallType>,
    created_by: Option<String>,
    started_at: Option<DateTime<Utc>>,
}

impl RoomMetadata {
    fn started(user_id: &str, call_type: ChannelCallType) -> Self {
        Self {
            call_type: Some(call_type),
            created_by: Some(user_id.to_string()),
            started_at: Some(Utc::now()),
        }
    }

    fn parse(raw: &str) -> Self {
        if raw.trim().is_empty() {
            return Self::default();
        }

        serde_json::from_str(raw).unwrap_or_default()
    }
}

#[derive(Debug, Clone)]
pub struct LiveKitService {
    api_url: String,
    ws_url: String,
    api_key: String,
    api_secret: String,
    room_prefix: String,
}

impl LiveKitService {
    pub fn new(config: LiveKitConfig) -> Self {
        Self {
            api_url: config.api_url,
            ws_url: config.ws_url,
            api_key: config.api_key,
            api_secret: config.api_secret,
            room_prefix: config.room_prefix,
        }
    }

    pub fn room_name(&self, channel_id: &Uuid) -> String {
        format!("{}-channel-{}", self.room_prefix, channel_id)
    }

    pub async fn get_call_state(&self, channel_id: Uuid) -> Result<ChannelCallState> {
        let room_name = self.room_name(&channel_id);
        let Some(metadata) = self.find_room_metadata(&room_name).await? else {
            return Ok(ChannelCallState {
                channel_id,
                status: ChannelCallStatus::Inactive,
                room_name: None,
                call_type: None,
                started_at: None,
                created_by: None,
                participant_count: 0,
                participants: Vec::new(),
            });
        };

        self.build_call_state(channel_id, &room_name, metadata)
            .await
    }

    pub async fn ensure_call(
        &self,
        channel_id: Uuid,
        user_id: &str,
        call_type: ChannelCallType,
    ) -> Result<JoinChannelCallResponse> {
        let room_name = self.room_name(&channel_id);

        let metadata = match self.find_room_metadata(&room_name).await? {
            Some(metadata) => metadata,
            None => self.create_room(&room_name, user_id, call_type).await?,
        };

        let token = AccessToken::with_api_key(&self.api_key, &self.api_secret)
            .with_identity(user_id)
            .with_grants(VideoGrants {
                room_join: true,
                room: room_name.clone(),
                can_publish: true,
                can_subscribe: true,
                can_publish_data: true,
                ..Default::default()
            })
            .with_ttl(std::time::Duration::from_secs(DEFAULT_TOKEN_TTL_SECONDS))
            .to_jwt()
            .context("failed to build LiveKit access token")?;

        Ok(JoinChannelCallResponse {
            call: self
                .build_call_state(channel_id, &room_name, metadata)
                .await?,
            room_name,
            server_url: self.ws_url.clone(),
            token,
            participant_identity: user_id.to_string(),
        })
    }

    pub async fn end_call(&self, channel_id: Uuid) -> Result<bool> {
        let room_name = self.room_name(&channel_id);
        if self.find_room_metadata(&room_name).await?.is_none() {
            return Ok(false);
        }

        self.client()
            .delete_room(&room_name)
            .await
            .context("failed to delete LiveKit room")?;

        Ok(true)
    }

    async fn build_call_state(
        &self,
        channel_id: Uuid,
        room_name: &str,
        metadata: String,
    ) -> Result<ChannelCallState> {
        let participants = self
            .client()
            .list_participants(room_name)
            .await
            .context("failed to list LiveKit participants")?;

        let parsed = RoomMetadata::parse(&metadata);
        let participants = participants
            .into_iter()
            .map(|participant| ChannelCallParticipant {
                identity: participant.identity,
                name: (!participant.name.is_empty()).then_some(participant.name),
                metadata: (!participant.metadata.is_empty()).then_some(participant.metadata),
            })
            .collect::<Vec<_>>();

        Ok(ChannelCallState {
            channel_id,
            status: ChannelCallStatus::Active,
            room_name: Some(room_name.to_string()),
            call_type: parsed.call_type,
            started_at: parsed.started_at,
            created_by: parsed.created_by,
            participant_count: participants.len(),
            participants,
        })
    }

    async fn create_room(
        &self,
        room_name: &str,
        user_id: &str,
        call_type: ChannelCallType,
    ) -> Result<String> {
        let metadata = serde_json::to_string(&RoomMetadata::started(user_id, call_type))
            .context("failed to encode LiveKit room metadata")?;
        let metadata_for_response = metadata.clone();

        match self
            .client()
            .create_room(
                room_name,
                CreateRoomOptions {
                    empty_timeout: DEFAULT_EMPTY_TIMEOUT_SECONDS,
                    departure_timeout: DEFAULT_DEPARTURE_TIMEOUT_SECONDS,
                    max_participants: DEFAULT_MAX_PARTICIPANTS,
                    metadata,
                    ..Default::default()
                },
            )
            .await
        {
            Ok(_) => Ok(metadata_for_response),
            Err(err) if is_twirp_code(&err, TwirpErrorCode::ALREADY_EXISTS) => self
                .find_room_metadata(room_name)
                .await?
                .context("LiveKit room already existed but could not be loaded"),
            Err(err) => Err(err).context("failed to create LiveKit room"),
        }
    }

    async fn find_room_metadata(&self, room_name: &str) -> Result<Option<String>> {
        let rooms = self
            .client()
            .list_rooms(vec![room_name.to_string()])
            .await
            .context("failed to list LiveKit rooms")?;

        Ok(rooms
            .into_iter()
            .find(|room| room.name == room_name)
            .map(|room| room.metadata))
    }

    fn client(&self) -> RoomClient {
        RoomClient::with_api_key(&self.api_url, &self.api_key, &self.api_secret)
    }
}

fn is_twirp_code(error: &ServiceError, expected_code: &str) -> bool {
    matches!(
        error,
        ServiceError::Twirp(TwirpError::Twirp(code)) if code.code == expected_code
    )
}

#[cfg(test)]
mod tests {
    use super::{ChannelCallType, RoomMetadata};

    #[test]
    fn parses_valid_room_metadata() {
        let raw =
            r#"{"call_type":"video","created_by":"user_123","started_at":"2026-03-20T15:00:00Z"}"#;
        let parsed = RoomMetadata::parse(raw);

        assert_eq!(parsed.call_type, Some(ChannelCallType::Video));
        assert_eq!(parsed.created_by.as_deref(), Some("user_123"));
        assert!(parsed.started_at.is_some());
    }

    #[test]
    fn ignores_invalid_room_metadata() {
        let parsed = RoomMetadata::parse("not-json");

        assert_eq!(parsed.call_type, None);
        assert_eq!(parsed.created_by, None);
        assert_eq!(parsed.started_at, None);
    }
}
