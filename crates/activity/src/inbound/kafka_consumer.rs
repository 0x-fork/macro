//! Kafka consumer that materializes activity facts from domain events.
//!
//! Delivery is at least once. Malformed messages and recognized-but-inert
//! events are committed so they cannot wedge a partition. Storage failures
//! are **not** committed: the record redelivers, and the deterministic fact
//! ids make the retried insert idempotent.

use std::future::Future;

use documents::domain::events::DocumentMacroEvent;
use kafka_util::{GroupName, KafkaEventConsumer};
use macro_event_broker::{
    KafkaConsumerAdapter, MacroEvent as _, MacroEventCollection as _, MacroEventConsumerService,
};
use rdkafka::consumer::CommitMode;
use rdkafka::message::{BorrowedMessage, Message as _};
use rootcause::prelude::{Report, ResultExt as _};
use tracing::Instrument as _;

use crate::domain::{
    documents::{Ingest, ingest_document_event},
    ports::ActivityRepo,
};

/// Consumer group for activity materialization offsets.
struct ActivityConsumerGroup;

impl GroupName for ActivityConsumerGroup {
    const GROUP_NAME: &'static str = "activity-materializer";
}

macro_event_broker::declare_topics!(
    ActivityDeclaredEvent:
        DocumentMacroEvent,
);

type ActivityKafkaAdapter = KafkaConsumerAdapter<ActivityConsumerGroup, ActivityDeclaredEvent>;
type ActivityKafkaConsumer = MacroEventConsumerService<ActivityDeclaredEvent, ActivityKafkaAdapter>;

/// Consumes activity-bearing topics and writes facts through the repo.
pub struct ActivityConsumer<R> {
    repo: R,
}

impl<R: ActivityRepo> ActivityConsumer<R> {
    /// Builds the consumer over a fact store.
    pub fn new(repo: R) -> Self {
        Self { repo }
    }

    /// Applies one decoded event to storage.
    async fn apply(&self, event: &ActivityDeclaredEvent) -> Result<(), R::Err> {
        let ingest = match event {
            ActivityDeclaredEvent::DocumentMacroEvent(event) => {
                ingest_document_event(event.event())
            }
        };
        match ingest {
            Ingest::Facts(facts) => self.repo.insert_facts(&facts).await,
            Ingest::PurgeEntity {
                entity_type,
                entity_id,
            } => self.repo.purge_entity(entity_type, &entity_id).await,
            Ingest::Ignore => Ok(()),
        }
    }

    /// Runs the consumer until `shutdown` resolves.
    #[tracing::instrument(skip(self, shutdown), fields(brokers), err)]
    pub async fn run(
        &self,
        brokers: &str,
        shutdown: impl Future<Output = ()> + Send,
    ) -> Result<(), Report> {
        let consumer = KafkaEventConsumer::<ActivityConsumerGroup>::from_env(brokers)?;
        let consumer = KafkaConsumerAdapter::<ActivityConsumerGroup, ()>::new(consumer)
            .subscribe::<ActivityDeclaredEvent>()
            .context("failed to subscribe to activity topics")?;
        let consumer = ActivityKafkaConsumer::new(consumer);
        tracing::info!(
            topics = ?ActivityDeclaredEvent::topics(),
            group = ActivityConsumerGroup::GROUP_NAME,
            "activity consumer listening"
        );

        let mut shutdown = std::pin::pin!(shutdown);
        loop {
            tokio::select! {
                _ = &mut shutdown => {
                    tracing::info!("activity consumer shutting down");
                    break;
                }
                result = consumer.recv() => {
                    let Ok(message) = result else { continue; };
                    let kafka_message = message.inner();
                    let span = tracing::info_span!(
                        "activity_source_event",
                        topic = kafka_message.topic(),
                        partition = kafka_message.partition(),
                        offset = kafka_message.offset(),
                    );
                    let decoded = {
                        let _guard = span.enter();
                        message.decode_payload()
                    };
                    let event = match decoded {
                        Ok(event) => event,
                        Err(_) => {
                            // Poison record: commit so it cannot wedge the
                            // partition.
                            commit_logged(&consumer, kafka_message);
                            continue;
                        }
                    };

                    match self.apply(&event).instrument(span).await {
                        Ok(()) => commit_logged(&consumer, kafka_message),
                        // Not committed: redelivery retries the write, and
                        // deterministic fact ids keep it idempotent.
                        Err(e) => {
                            tracing::error!(error=?e, "failed to store activity facts");
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

fn commit_logged(consumer: &ActivityKafkaConsumer, message: &BorrowedMessage<'_>) {
    let _ = consumer.inner().commit_message(message, CommitMode::Async);
}
