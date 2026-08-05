//! The activity fact model.

#[cfg(test)]
mod test;

use std::sync::LazyLock;

use chrono::{DateTime, Utc};
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::EntityType;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

/// A principal that can act on entities: a user or a bot, as one
/// prefix-parseable string. An agent is a bot acting with `on_behalf_of`
/// set — agent-ness is relational, not an identity kind.
pub use channel_sender::ChannelSender as Actor;

/// Namespace for deriving deterministic fact ids from source event ids.
static FACT_ID_NAMESPACE: LazyLock<Uuid> =
    LazyLock::new(|| Uuid::new_v5(&Uuid::NAMESPACE_OID, b"macro.activity_events"));

/// What a principal did. The serde representation is adjacent-tagged so the
/// variant name and its payload project directly onto the `action` and
/// `action_payload` columns.
///
/// Vocabulary grows with each consumed topic; variants and their fields are
/// never renamed or repurposed — stored facts are immutable and must
/// deserialize forever. New payload fields must take `#[serde(default)]`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "action", content = "payload", rename_all = "snake_case")]
pub enum Action {
    /// The entity was created.
    Created,
    /// The entity's content or metadata was edited.
    Edited,
    /// The entity was opened by its subject.
    Opened,
    /// The entity was soft-deleted.
    Deleted,
}

impl Action {
    /// Whether this action is a view rather than a mutation — the only
    /// classification activity queries need.
    pub fn is_view(&self) -> bool {
        matches!(self, Action::Opened)
    }

    /// Splits the action into its `(action, action_payload)` column values.
    pub fn to_columns(&self) -> (String, Option<Value>) {
        // Adjacent tagging serializes to {"action": "...", "payload": ...?};
        // an enum of unit/struct variants cannot fail to serialize.
        let Ok(Value::Object(mut parts)) = serde_json::to_value(self) else {
            unreachable!("Action always serializes to an adjacent-tagged object");
        };
        let Some(Value::String(action)) = parts.remove("action") else {
            unreachable!("adjacent tagging always emits a string action tag");
        };
        (action, parts.remove("payload"))
    }
}

/// One activity fact: a principal did something to an entity at a time.
#[derive(Debug, Clone, PartialEq)]
pub struct ActivityFact {
    /// Deterministic id: uuidv5 over (source event id, ordinal), so replays
    /// of the same broker event re-derive the same fact ids.
    pub id: Uuid,
    /// Who mechanically acted.
    pub actor: Actor<'static>,
    /// Whose activity this is: `on_behalf_of ?? actor`, resolved here at
    /// construction and never re-derived downstream.
    pub subject_id: String,
    /// What they did.
    pub action: Action,
    /// The kind of entity acted on, in the soup item-type vocabulary.
    pub entity_type: EntityType,
    /// The entity acted on.
    pub entity_id: String,
    /// When it happened, per the source event.
    pub occurred_at: DateTime<Utc>,
}

impl ActivityFact {
    /// Builds a fact, deriving its id from the source event and resolving
    /// the subject from the delegation relationship.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        source_event_id: Uuid,
        ordinal: u32,
        actor: Actor<'static>,
        on_behalf_of: Option<MacroUserIdStr<'static>>,
        action: Action,
        entity_type: EntityType,
        entity_id: impl Into<String>,
        occurred_at: DateTime<Utc>,
    ) -> Self {
        let subject_id = on_behalf_of
            .map(|user| user.as_ref().to_owned())
            .unwrap_or_else(|| actor.as_ref().to_owned());
        Self {
            id: fact_id(source_event_id, ordinal),
            actor,
            subject_id,
            action,
            entity_type,
            entity_id: entity_id.into(),
            occurred_at,
        }
    }
}

/// Derives the deterministic id for the `ordinal`-th fact produced by the
/// broker event `source_event_id`.
pub fn fact_id(source_event_id: Uuid, ordinal: u32) -> Uuid {
    Uuid::new_v5(
        &FACT_ID_NAMESPACE,
        format!("{source_event_id}:{ordinal}").as_bytes(),
    )
}
