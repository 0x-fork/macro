#![deny(missing_docs)]

//! Shared types and SQL fragments for calls. Lives in its own crate so
//! consumers that need only data shapes (`models_soup`) or only the
//! shared access SQL (`macro_db_client`, `call`'s outbound adapter) can
//! avoid pulling in the full `call` service crate, which would create
//! dependency cycles and pull RTC/livekit deps into otherwise lean
//! crates.

pub mod sql;

use chrono::{DateTime, Utc};
use uuid::Uuid;

/// A transcript segment as returned in a [`CallRecord`].
#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct CallRecordTranscriptSegment {
    /// LiveKit segment ID (nullable for archived records).
    pub segment_id: Option<String>,
    /// The speaker's user ID.
    pub speaker_id: String,
    /// Stable per-speaker identifier produced by the STT provider's diarization
    /// pass. Unique across tracks in the call. `None` when the provider didn't
    /// return a speaker label.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diarized_speaker_id: Option<String>,
    /// The transcribed text content.
    pub content: String,
    /// When the speaker started this segment.
    pub started_at: DateTime<Utc>,
    /// When the speaker stopped (if known).
    pub ended_at: Option<DateTime<Utc>>,
    /// Ordering within the call.
    pub sequence_num: i32,
}

/// A participant as returned in a [`CallRecord`] (historic — includes `left_at`).
#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct CallRecordParticipant {
    /// The user id.
    pub user_id: String,
    /// When the user joined the call.
    pub joined_at: DateTime<Utc>,
    /// When the user left (None if still in an active call).
    pub left_at: Option<DateTime<Utc>>,
}

/// Full record of a call, unifying rows from `calls` (active) and
/// `call_records` (archived) into a single response shape.
#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct CallRecord {
    /// The call identifier.
    pub call_id: Uuid,
    /// The channel this call belongs to.
    pub channel_id: Uuid,
    /// The RTC room name.
    pub room_name: String,
    /// User who created the call.
    pub created_by: String,
    /// When the call started (created_at for active, started_at for archived).
    pub started_at: DateTime<Utc>,
    /// When the call ended (None if still active).
    pub ended_at: Option<DateTime<Utc>>,
    /// Call duration in milliseconds (None if still active).
    pub duration_ms: Option<i64>,
    /// Recording egress ID, if any.
    pub egress_id: Option<String>,
    /// S3 object key for the call recording (internal, not serialized).
    #[serde(skip_serializing)]
    pub recording_key: Option<String>,
    /// Presigned URL for the call recording, if available.
    pub recording_url: Option<String>,
    /// Resolved display name for the channel.
    pub channel_name: Option<String>,
    /// User-supplied or AI-generated display name for the call. Only set on
    /// archived `call_records`; active calls always return `None`.
    pub custom_name: Option<String>,
    /// AI-generated summary of the call. Only set on archived `call_records`
    /// once summarization has run; active calls always return `None`.
    pub summary: Option<String>,
    /// Whether the call is currently active (from `calls` table).
    pub is_active: bool,
    /// Participants (both active and historic).
    pub participants: Vec<CallRecordParticipant>,
    /// Transcript segments ordered by `sequence_num`.
    pub transcript: Vec<CallRecordTranscriptSegment>,
}
