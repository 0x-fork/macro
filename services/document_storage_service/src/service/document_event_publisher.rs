#[cfg(test)]
mod test;

use chrono::{DateTime, Utc};
use documents_hex::domain::events::{
    DocumentMacroEvent, DocumentOpenedMetadata, DocumentPurgedMetadata,
};
use macro_event_broker::{EventBrokerError, MacroEventBroker};
use macro_user_id::user_id::MacroUserIdStr;

/// Schedules a document-purged event for asynchronous broker delivery.
#[tracing::instrument(skip(event_broker), err)]
pub(crate) fn publish_document_purged_event<B: MacroEventBroker>(
    event_broker: &B,
    document_id: &str,
) -> Result<(), EventBrokerError> {
    let document_id = document_id.to_owned();
    let event =
        DocumentMacroEvent::purged(document_id.clone(), DocumentPurgedMetadata { document_id });

    drop(event_broker.send_event(&event)?);
    Ok(())
}

/// Schedules a document-opened event for asynchronous broker delivery.
#[tracing::instrument(skip(event_broker), err)]
pub(crate) fn publish_document_opened_event<B: MacroEventBroker>(
    event_broker: &B,
    document_id: &str,
    actor_user_id: MacroUserIdStr<'static>,
    opened_at: DateTime<Utc>,
) -> Result<(), EventBrokerError> {
    let document_id = document_id.to_owned();
    let event = DocumentMacroEvent::opened(
        document_id.clone(),
        DocumentOpenedMetadata {
            document_id,
            actor_user_id,
            opened_at,
        },
    );

    drop(event_broker.send_event(&event)?);
    Ok(())
}
