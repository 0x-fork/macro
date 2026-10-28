//! Personal accounts, added external chats and deliberate sends, as DSS and
//! the web app see them. Session-service events live in [`super::events`].

use chrono::{DateTime, Utc};
pub use model_entity::{ExternalChatKind, ExternalChatProvider};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Account lifecycle. Transport outages are not stored: a connected account
/// stays connected while its session service reconnects.
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    strum::IntoStaticStr,
    strum::EnumString,
)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = WhatsAppAccountState))]
#[strum(serialize_all = "snake_case")]
pub enum AccountState {
    /// A pairing transaction is in progress.
    Pairing,
    /// Paired with a verified identity; observation consent is active.
    Connected,
    /// WhatsApp ended the session; the owner must reconnect explicitly.
    LoggedOut,
    /// The owner ended observation consent.
    Disconnected,
}

impl AccountState {
    /// Stable storage spelling.
    pub fn as_str(self) -> &'static str {
        self.into()
    }

    /// Parse the storage spelling.
    pub fn parse(value: &str) -> Option<Self> {
        value.parse().ok()
    }
}

/// One person's account, never owned by a workspace.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = WhatsAppAccount))]
pub struct Account {
    /// Stable account identity.
    pub id: Uuid,
    /// Authenticated owner.
    pub user_id: String,
    /// WhatsApp-verified identity, absent until the first pairing succeeds.
    pub identity_jid: Option<String>,
    /// Lifecycle.
    pub state: AccountState,
    /// Explicit consent generation; reconnecting a socket never changes it.
    pub authorization_generation: i64,
}

/// Pairing transaction state.
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    strum::IntoStaticStr,
    strum::EnumString,
)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = WhatsAppPairingState))]
#[strum(serialize_all = "snake_case")]
pub enum PairingState {
    /// Waiting for a session-service replica to start the device.
    Waiting,
    /// A QR code or pairing code is ready to show.
    Qr,
    /// WhatsApp asked for a passkey confirmation on the phone.
    Passkey,
    /// Paired; the account is connected.
    Success,
    /// The transaction timed out.
    Expired,
    /// The owner cancelled.
    Cancelled,
    /// Pairing failed or was rejected.
    Failed,
}

impl PairingState {
    /// Stable storage spelling.
    pub fn as_str(self) -> &'static str {
        self.into()
    }

    /// Parse the storage spelling.
    pub fn parse(value: &str) -> Option<Self> {
        value.parse().ok()
    }
}

/// Owner-bound pairing transaction, without its QR or pairing code.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = WhatsAppPairing))]
pub struct Pairing {
    /// One-use transaction id.
    pub id: Uuid,
    /// Account being connected.
    pub account_id: Uuid,
    /// Current state.
    pub state: PairingState,
    /// Database-assigned deadline.
    pub expires_at: DateTime<Utc>,
}

/// Owner-only pairing status. Deliberately has no `Debug` implementation: the
/// QR and pairing code are secrets for the duration of the transaction.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = WhatsAppPairState))]
pub struct PairState {
    /// Current state.
    pub state: PairingState,
    /// Current QR content; rotates while the transaction waits.
    pub qr: Option<String>,
    /// Pairing code to type on the phone, when phone-number pairing is used.
    pub code: Option<String>,
    /// WhatsApp's WebAuthn request options while the state is `passkey`; the
    /// native authenticator answers through the passkey route.
    #[cfg_attr(feature = "schema", schema(value_type = Option<Object>))]
    pub challenge: Option<serde_json::Value>,
    /// Verified identity once paired.
    pub identity_jid: Option<String>,
    /// Same owner-bound deadline.
    pub expires_at: DateTime<Utc>,
}

/// Explicit request to add a chat; the provider account is selected
/// server-side. The chat's name always follows the provider.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatAdd))]
pub struct AddChat {
    /// The service the chat lives in.
    pub provider: ExternalChatProvider,
    /// The chat's id at the provider, as its chat list names it. WhatsApp: a
    /// group the requester's account has joined, or a direct chat's other
    /// person's JID.
    pub remote_id: String,
    /// Group or direct chat; must match what `remote_id` is.
    pub kind: ExternalChatKind,
}

/// Binding lifecycle.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BindingState {
    /// Observed and sendable.
    Active,
    /// Locally detached; history stays readable.
    Detached,
}

/// One remote chat bound to a person's external chat entity.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct Binding {
    /// Stable binding identity, independent of any observing account; the
    /// external chat entity id.
    pub id: Uuid,
    /// The service the chat lives in.
    pub provider: ExternalChatProvider,
    /// Remote chat identity, never its display name. WhatsApp: the group's
    /// JID, or a direct chat's other person.
    pub remote_id: String,
    /// Group or direct chat.
    pub kind: ExternalChatKind,
    /// The person who added the group, its owner.
    pub user_id: String,
    /// Lifecycle.
    pub state: BindingState,
    /// History boundary for the binding.
    pub adopted_at: DateTime<Utc>,
}

/// Verified sender aliases, supplied only by protocol metadata. Stored in
/// roster metadata and retained events as camelCase JSON.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    /// Phone-number or LID account JID.
    pub jid: String,
    /// Verified alternate identity, never inferred from a name or phone typed by a user.
    #[serde(default)]
    pub alternate_jid: Option<String>,
    /// Untrusted display name.
    #[serde(default)]
    pub display_name: Option<String>,
}

impl Identity {
    /// What to call this person: their WhatsApp name, else their phone number.
    pub fn label(&self) -> Option<String> {
        if let Some(name) = self.display_name.as_deref().map(str::trim)
            && !name.is_empty()
        {
            return Some(name.to_owned());
        }
        [Some(self.jid.as_str()), self.alternate_jid.as_deref()]
            .into_iter()
            .flatten()
            .find_map(super::jid::phone_number)
    }
}

/// Current remote participant; Macro access is a separate grant.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Participant {
    /// Identity evidence.
    #[serde(flatten)]
    pub identity: Identity,
    /// Group admin; only admins post in announcement groups.
    pub admin: bool,
}

/// One full metadata read of a group, never an incomplete membership delta.
/// The session service reports it and it is stored as roster metadata
/// (camelCase JSON); the API shows it as [`crate::domain::timeline::ExternalChatMembers`].
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GroupInfo {
    /// Remote group JID.
    pub jid: String,
    /// Current subject.
    pub name: String,
    /// Full roster.
    pub participants: Vec<Participant>,
    /// Only admins may post.
    pub announce: bool,
    /// Disappearing-messages timer in seconds while it is on. Macro keeps the
    /// messages; its sends carry the timer so phones treat them like their own.
    #[serde(default)]
    pub disappearing_seconds: Option<u32>,
    /// The community itself: it has no messages of its own and can't be added.
    #[serde(default)]
    pub community_parent: bool,
    /// The community a linked subgroup or announcement group belongs to.
    #[serde(default)]
    pub community_jid: Option<String>,
    /// The community's announcement group (everyone reads, admins post).
    #[serde(default)]
    pub community_announcements: bool,
    /// When the session service read this metadata.
    pub observed_at: DateTime<Utc>,
}

/// An external chat entity bound to a remote chat.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatReference))]
pub struct ChatReference {
    /// External chat entity id.
    pub id: Uuid,
    /// Display name, following WhatsApp.
    pub name: String,
}

/// The WhatsApp community a group belongs to.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatCommunity))]
pub struct CommunityReference {
    /// The community's WhatsApp JID.
    pub id: String,
    /// The community's name.
    pub name: String,
    /// This group is the community's announcement group.
    pub announcements: bool,
}

/// Shown when the community itself is not in the account's group list.
const UNKNOWN_COMMUNITY_NAME: &str = "WhatsApp community";

impl CommunityReference {
    /// The community `id`, named after its own metadata's `name` when known.
    pub fn named(id: String, name: Option<&str>, announcements: bool) -> Self {
        let name = name
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .unwrap_or(UNKNOWN_COMMUNITY_NAME)
            .to_owned();
        Self {
            id,
            name,
            announcements,
        }
    }
}

/// Another person's external chat entity the caller can view.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = SharedExternalChatReference))]
pub struct SharedChatReference {
    /// External chat entity id.
    pub id: Uuid,
    /// Display name, following WhatsApp.
    pub name: String,
    /// Macro user who added the chat and shared it.
    pub owner_id: String,
}

impl GroupInfo {
    /// Match only protocol-verified aliases; never names.
    pub fn participant(&self, identity: &str) -> Option<&Participant> {
        self.participants.iter().find(|p| {
            p.identity.jid == identity || p.identity.alternate_jid.as_deref() == Some(identity)
        })
    }

    /// The WhatsApp subject, or for an unnamed group the names of its other
    /// members as WhatsApp shows them: "Ana, Ben, +2".
    pub fn display_name(&self, identity: &str) -> String {
        let subject = self.name.trim();
        if !subject.is_empty() {
            return subject.to_owned();
        }
        let others: Vec<&Participant> = self
            .participants
            .iter()
            .filter(|p| {
                p.identity.jid != identity && p.identity.alternate_jid.as_deref() != Some(identity)
            })
            .collect();
        let names: Vec<String> = others
            .iter()
            .filter_map(|p| p.identity.label())
            .take(2)
            .collect();
        if names.is_empty() {
            return "WhatsApp group".to_owned();
        }
        let rest = others.len() - names.len();
        if rest == 0 {
            names.join(", ")
        } else {
            format!("{}, +{rest}", names.join(", "))
        }
    }

    /// The community this group belongs to, named after `parent` (the
    /// community's own metadata) when known.
    pub fn community(&self, parent: Option<&GroupInfo>) -> Option<CommunityReference> {
        Some(CommunityReference::named(
            self.community_jid.clone()?,
            parent.map(|parent| parent.name.as_str()),
            self.community_announcements,
        ))
    }

    /// Whether the given identity may post under the group's current settings.
    pub fn can_post(&self, identity: &str) -> bool {
        self.participant(identity)
            .is_some_and(|p| !self.announce || p.admin)
            && !self.community_parent
    }
}

/// Why a chat can't be added to Macro; the app words it from the code.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, thiserror::Error)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = WhatsAppCannotAdd))]
pub enum CannotAdd {
    /// The account's WhatsApp left the group or was removed.
    #[error("your WhatsApp is not in this group any more")]
    NotInGroup,
    /// A community itself has no messages; its groups can be added.
    #[error("a community has no messages of its own; add one of its groups")]
    Community,
    /// The chat with yourself.
    #[error("your chat with yourself can't be added to Macro")]
    OwnChat,
    /// A direct chat that is not in the account's chat list.
    #[error("this chat is not in your WhatsApp chat list")]
    NotInChatList,
}

/// One chat of the caller's WhatsApp chat list, as WhatsApp Web lists it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = WhatsAppChat))]
pub struct Chat {
    /// WhatsApp chat JID: a group, or the other person's phone-number JID
    /// (LID when WhatsApp never told us the number).
    pub jid: String,
    /// Group or direct chat.
    pub kind: ExternalChatKind,
    /// Group: the subject, or member names for an unnamed group. Direct: the
    /// contact or WhatsApp name, else `+<phone>`. Always non-empty.
    pub name: String,
    /// Newest activity WhatsApp reported (message or history sync); `null`
    /// when unknown. The list is sorted by it, newest first, unknown last.
    pub last_activity_at: Option<DateTime<Utc>>,
    /// Archived in WhatsApp.
    pub archived: bool,
    /// Pinned in WhatsApp.
    pub pinned: bool,
    /// The caller's own external chat for this chat, once added.
    pub added: Option<ChatReference>,
    /// Someone else's external chat for this chat shared with the caller,
    /// when the caller has not added their own.
    pub shared: Option<SharedChatReference>,
    /// "Add to Macro" works now.
    pub can_add: bool,
    /// Why it can't be added, when it is neither added, shared nor addable.
    pub cannot_add_reason: Option<CannotAdd>,
    /// The community a group belongs to (a community's group or its
    /// announcement group); `null` otherwise.
    pub community: Option<CommunityReference>,
}

/// The caller's WhatsApp chat list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = WhatsAppChats))]
pub struct ChatList {
    /// Newest activity first; chats with unknown activity last, by name.
    pub chats: Vec<Chat>,
}

/// Where importing a group's earlier messages stands.
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    strum::IntoStaticStr,
    strum::EnumString,
)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatBackfillState))]
#[strum(serialize_all = "snake_case")]
pub enum BackfillState {
    /// Nothing to start from: the owner's account knows no message in this
    /// chat yet (paired before WhatsApp sent its chat list, and quiet since).
    /// Becomes `pending` with the chat's first message.
    WaitingForMessage,
    /// About to start: the owner's account has not picked it up yet.
    Pending,
    /// Asking the owner's phone for earlier messages.
    Running,
    /// The owner's phone did not answer; retried when it is back.
    WaitingForPhone,
    /// Everything the phone had (within the limits) was imported.
    Done,
    /// Stopped at the limits ([`BACKFILL_MESSAGE_LIMIT`] messages or
    /// [`BACKFILL_MAX_AGE_DAYS`] days); older messages stay in WhatsApp.
    Partial,
}

impl BackfillState {
    /// Stable storage spelling.
    pub fn as_str(self) -> &'static str {
        self.into()
    }

    /// Parse the storage spelling.
    pub fn parse(value: &str) -> Option<Self> {
        value.parse().ok()
    }
}

/// Earlier messages imported after adding a chat.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatBackfill))]
pub struct Backfill {
    /// Progress.
    pub state: BackfillState,
    /// Messages received from the phone so far (including ones already shown).
    pub imported: u32,
}

/// Most earlier messages imported when a group is added.
pub const BACKFILL_MESSAGE_LIMIT: u32 = 500;
/// Earlier messages older than this many days before adding are not imported.
pub const BACKFILL_MAX_AGE_DAYS: i64 = 90;

/// Deliberate operations on an existing message.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatMutation))]
pub enum Mutation {
    /// Add, replace or remove the caller's reaction.
    Reaction,
    /// Edit the caller's own recent message.
    Edit,
    /// Delete the caller's own recent message for everyone.
    Delete,
}

/// Content of a deliberate send.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatReplyContent))]
pub enum ReplyContent {
    /// Plain text.
    Text {
        /// UTF-8 text, at most [`TEXT_LIMIT_BYTES`] bytes.
        text: String,
        /// Group participants the text @-mentions, by their WhatsApp id
        /// (`jid` of a roster participant); the text must contain
        /// `@<digits before the @ of the id>` for each.
        #[serde(default)]
        mentions: Vec<String>,
    },
    /// One attachment staged through the attachments route.
    Media {
        /// The staged upload, imported as the message's static file.
        #[serde(rename = "uploadId")]
        upload_id: Uuid,
        /// Optional caption; audio has none.
        caption: Option<String>,
    },
    /// An operation on an existing message in this chat.
    Mutation {
        /// Existing message, resolved to its provider source by the server.
        #[serde(rename = "messageId")]
        message_id: Uuid,
        /// Explicit operation.
        operation: Mutation,
        /// Replacement text or emoji; absent for delete, empty to remove a reaction.
        text: Option<String>,
    },
}

/// Explicit send action from a person. Only deliberate sends reach WhatsApp.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatSendReply))]
pub struct SendReply {
    /// Stable client intent key. A changed payload with this key is a conflict.
    pub idempotency_key: Uuid,
    /// Content.
    pub message: ReplyContent,
    /// Message being quoted, within this chat.
    #[serde(default)]
    pub reply_to: Option<Uuid>,
}

/// Observed send state. `unknown` means the request may have reached WhatsApp;
/// it is never sent again automatically.
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    strum::IntoStaticStr,
    strum::EnumString,
)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatDeliveryState))]
#[strum(serialize_all = "snake_case")]
pub enum DeliveryState {
    /// Durable intent, not yet claimed.
    Pending,
    /// Claimed by the account's session; may already be dispatching.
    Sending,
    /// The outcome of a dispatched request is not known.
    Unknown,
    /// WhatsApp accepted the message; this does not establish delivery.
    Accepted,
    /// Rejected, expired or no longer authorized.
    Failed,
}

impl DeliveryState {
    /// Stable storage spelling.
    pub fn as_str(self) -> &'static str {
        self.into()
    }

    /// Parse the storage spelling.
    pub fn parse(value: &str) -> Option<Self> {
        value.parse().ok()
    }
}

/// Durable result of a deliberate send.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatSendProgress))]
pub struct SendProgress {
    /// Stable intent id.
    pub id: Uuid,
    /// Person who submitted it.
    pub user_id: String,
    /// External chat.
    pub chat_id: Uuid,
    /// The original request, so a failed draft can be recovered.
    pub payload: SendReply,
    /// Current state.
    pub state: DeliveryState,
    /// The chat's message, once the provider accepted it.
    pub message_id: Option<Uuid>,
    /// Sanitized failure code.
    pub error_code: Option<String>,
    /// Intent creation time.
    pub created_at: DateTime<Utc>,
}

/// Attachment categories WhatsApp distinguishes.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatMediaKind))]
pub enum MediaKind {
    /// JPEG, PNG or WebP.
    Image,
    /// MP3, Ogg, AAC or MP4 audio. Ogg/Opus is sent as a voice note.
    Audio,
    /// MP4 video.
    Video,
    /// PDF or plain text.
    Document,
}

/// Every MIME type Macro sends to WhatsApp, with its category.
pub const SENDABLE_MEDIA: [(&str, MediaKind); 10] = [
    ("image/jpeg", MediaKind::Image),
    ("image/png", MediaKind::Image),
    ("image/webp", MediaKind::Image),
    ("audio/mpeg", MediaKind::Audio),
    ("audio/ogg", MediaKind::Audio),
    ("audio/aac", MediaKind::Audio),
    ("audio/mp4", MediaKind::Audio),
    ("video/mp4", MediaKind::Video),
    ("application/pdf", MediaKind::Document),
    ("text/plain", MediaKind::Document),
];

impl MediaKind {
    /// Category of a supported MIME type; anything else is refused.
    pub fn of(mime: &str) -> Option<Self> {
        SENDABLE_MEDIA
            .iter()
            .find(|(sendable, _)| *sendable == mime)
            .map(|(_, kind)| *kind)
    }
}

/// How WhatsApp shows an attachment, when not as a plain file of its kind.
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    strum::IntoStaticStr,
    strum::EnumString,
)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatMediaPresentation))]
#[strum(serialize_all = "snake_case")]
pub enum MediaPresentation {
    /// A sticker: a small image (WebP, possibly animated), no caption.
    Sticker,
    /// A short video WhatsApp plays as a looping, muted GIF.
    Gif,
    /// A voice note recorded in WhatsApp (push to talk).
    VoiceNote,
}

impl MediaPresentation {
    /// Stable storage spelling.
    pub fn as_str(self) -> &'static str {
        self.into()
    }

    /// Parse the storage spelling.
    pub fn parse(value: &str) -> Option<Self> {
        value.parse().ok()
    }
}

/// Largest attachment imported or sent, in bytes.
pub const MEDIA_LIMIT_BYTES: usize = 32 * 1024 * 1024;

/// A staged attachment, sent only by a later deliberate send.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatUploadedAttachment))]
pub struct UploadedAttachment {
    /// Use as `upload_id` in a media send.
    pub upload_id: Uuid,
    /// Display filename.
    pub filename: String,
    /// Category.
    pub kind: MediaKind,
}

/// Where an attachment of a message stands.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatAttachmentState))]
pub enum AttachmentState {
    /// Downloading or importing.
    Loading,
    /// Imported; `file_id` is set.
    Ready,
    /// Download or import failed for good.
    Unavailable,
    /// A file type Macro does not import.
    Unsupported,
}

/// One attachment of a message.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatAttachment))]
pub struct Attachment {
    /// Position within the message.
    pub ordinal: i16,
    /// Current state.
    pub state: AttachmentState,
    /// Display filename.
    pub file_name: String,
    /// Declared MIME type.
    pub mime: String,
    /// Declared size in bytes.
    pub size: u64,
    /// The static file holding it, once ready.
    pub file_id: Option<Uuid>,
    /// Pixel width of an image, sticker or video, when WhatsApp declared it.
    pub width: Option<u32>,
    /// Pixel height, when declared.
    pub height: Option<u32>,
    /// Length of audio or video in whole seconds, when declared.
    pub duration_seconds: Option<u32>,
    /// Sticker, GIF or voice note; `null` for an ordinary file of its kind.
    pub presentation: Option<MediaPresentation>,
}

/// The attachments of one message.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatMessageAttachments))]
pub struct MessageAttachments {
    /// The message.
    pub message_id: Uuid,
    /// Its attachments in order; deleted ones are omitted.
    pub attachments: Vec<Attachment>,
}

/// Most people one text send may @-mention.
pub const MENTION_LIMIT: usize = 64;

/// Largest WebAuthn challenge or assertion passed through a pairing.
pub const PASSKEY_LIMIT_BYTES: usize = 32 * 1024;

/// Most messages or send ids one attachments or delivery request names.
pub const BATCH_LIMIT: usize = 100;

/// Most messages in one timeline page, and the page size when none is asked.
pub const PAGE_LIMIT: i64 = 100;
/// Timeline page size when the caller names none.
pub const DEFAULT_PAGE: i64 = 50;

/// Days a participant's receipt is kept.
pub const RECEIPT_RETENTION_DAYS: i32 = 30;
/// Maximum UTF-8 bytes in one text send.
pub const TEXT_LIMIT_BYTES: usize = 16 * 1024;
/// Edits and deletes are offered for this long after the original send.
pub const MUTATION_WINDOW_SECONDS: i64 = 10 * 60;
/// Unattempted intents expire this long after they were created.
pub const SEND_EXPIRY_SECONDS: i64 = 10 * 60;

/// Operations implemented for a chat, independent of current permission.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatCapabilities))]
pub struct Capabilities {
    /// Maximum UTF-8 bytes per text send.
    pub text_limit_bytes: u32,
    /// Supported message operations.
    pub mutations: Vec<Mutation>,
    /// Edits and deletes are offered this long after sending.
    pub mutation_window_seconds: u32,
    /// Attachments per send.
    pub max_attachments: u8,
    /// Largest attachment in bytes.
    pub attachment_limit_bytes: u32,
    /// Supported attachment MIME types.
    pub attachment_types: Vec<String>,
}

impl Default for Capabilities {
    fn default() -> Self {
        Self {
            text_limit_bytes: TEXT_LIMIT_BYTES as u32,
            mutations: vec![Mutation::Reaction, Mutation::Edit, Mutation::Delete],
            mutation_window_seconds: MUTATION_WINDOW_SECONDS as u32,
            max_attachments: 1,
            attachment_limit_bytes: MEDIA_LIMIT_BYTES as u32,
            attachment_types: SENDABLE_MEDIA
                .iter()
                .map(|(mime, _)| (*mime).to_owned())
                .collect(),
        }
    }
}

/// Why the viewer cannot send now.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = ExternalChatReplyBlock))]
pub enum ReplyBlock {
    /// The viewer has not connected their own account at the provider.
    NoAccount,
    /// The viewer's provider account is not connected.
    Disconnected,
    /// The viewer has not added this chat from their own account.
    NotAdded,
    /// The viewer is not in the chat, or may not post in it now.
    NotAllowed,
    /// The chat is detached.
    Unavailable,
}

/// Owner-scoped account state, including not connected.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = WhatsAppAccountView))]
pub struct AccountView {
    /// The caller's account, when one exists.
    pub account: Option<Account>,
}

/// Result of disconnecting an account.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schema", schema(as = WhatsAppDisconnect))]
pub struct Disconnect {
    /// The session service was asked to log the device out of WhatsApp. It
    /// unlinks asynchronously; WhatsApp's Linked devices list is authoritative.
    pub remote_unlink_requested: bool,
}

/// Who is sending, as authenticated by the invoking path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SendAuthority {
    /// A person acting in the app.
    Human,
    /// The person's verified API credential; sends only from their own account.
    UserApiToken,
    /// Acting for the person without being them: a session carrying an agent
    /// attribution. Bots, harnesses and internal callers never reach these use
    /// cases (`UserOnly` rejects them). Never sends to WhatsApp.
    Automation,
}

/// Sanitized failures safe to show in the native UI.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum LinkedError {
    /// Invalid input with actionable detail.
    #[error("{0}")]
    Invalid(&'static str),
    /// The chat can't be added to Macro.
    #[error("{0}")]
    CannotAdd(CannotAdd),
    /// Absent or outside the caller's authorized scope.
    #[error("not found")]
    NotFound,
    /// The caller lacks authority for this operation.
    #[error("you do not have permission for this WhatsApp operation")]
    Forbidden,
    /// Conflicts with an existing identity, transaction or idempotency key.
    #[error("this conflicts with an existing WhatsApp connection or request")]
    Conflict,
    /// The account is not connected.
    #[error("connect your WhatsApp account first")]
    Disconnected,
    /// The intent expired before it was attempted.
    #[error("send_expired")]
    SendExpired,
    /// The session-service lease epoch is stale; the replica must stop the account.
    #[error("lease_fenced")]
    Fenced,
    /// The person's deliberate send request budget is exhausted.
    #[error("wait one second before sending another WhatsApp request")]
    RateLimited,
    /// Retryable infrastructure failure.
    #[error("WhatsApp is temporarily unavailable; retry shortly")]
    Unavailable,
    /// The account has too many events waiting to be stored; the session
    /// service leaves the event unacknowledged and WhatsApp redelivers it.
    #[error("too many WhatsApp events are waiting for this account")]
    Backlogged,
    /// Stored data broke an invariant; retrying does not help. The report
    /// carries the cause.
    #[error("something went wrong with this WhatsApp chat")]
    Internal,
}

impl LinkedError {
    /// Stable code for logs, spans and clients.
    pub const fn code(&self) -> &'static str {
        match self {
            Self::Invalid(_) => "invalid_input",
            Self::CannotAdd(CannotAdd::NotInGroup) => "cannot_add_not_in_group",
            Self::CannotAdd(CannotAdd::Community) => "cannot_add_community",
            Self::CannotAdd(CannotAdd::OwnChat) => "cannot_add_own_chat",
            Self::CannotAdd(CannotAdd::NotInChatList) => "cannot_add_not_in_chat_list",
            Self::NotFound => "not_found",
            Self::Forbidden => "forbidden",
            Self::Conflict => "conflict",
            Self::Disconnected => "disconnected",
            Self::SendExpired => "send_expired",
            Self::Fenced => "lease_fenced",
            Self::RateLimited => "rate_limited",
            Self::Unavailable => "temporarily_unavailable",
            Self::Backlogged => "backlogged",
            Self::Internal => "internal_error",
        }
    }
}
