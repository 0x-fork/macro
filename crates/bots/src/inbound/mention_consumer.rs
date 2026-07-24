//! Kafka consumer that triggers agent bots from `macro.mentions` events.
//!
//! Subscribes to [`MentionMacroEvent`] under the `bot-agent-triggers` group
//! and hands every decoded event to a
//! [`BotMentionTriggerService`](crate::domain::triggers::BotMentionTriggerService).
//!
//! Delivery is at-least-once for the derived `channel.bot-mentioned` event:
//! an offset is committed only after the trigger service handled the mention
//! or skipped it. Transient failures (state loads, publishing the derived
//! event) are retried in-process with exponential backoff; if a transient
//! failure outlives every attempt the consumer exits with an error *without*
//! committing, so the supervising restart loop redelivers the event. In-process
//! Macro agent runs are fire-and-forget: they are spawned before the commit
//! and a crash mid-run drops the response, matching the previous in-process
//! trigger channel. Undecodable messages are logged and skipped rather than
//! wedging the partition.

use crate::domain::agent::AgentResponder;
use crate::domain::ports::BotRepo;
use crate::domain::triggers::BotMentionTriggerService;
use anyhow::Context as _;
use channels::domain::mention_events::MentionMacroEvent;
use channels::domain::ports::ChannelService;
use kafka_util::{GroupName, KafkaEventConsumer};
use macro_event_broker::{
    KafkaConsumerAdapter, MacroEvent as _, MacroEventBroker, MacroEventCollection as _,
    MacroEventConsumerService,
};
use rdkafka::consumer::CommitMode;
use rdkafka::message::{BorrowedMessage, Message};
use std::future::Future;
use std::time::Duration;

/// Consumer group for agent bot triggers. Offsets are committed under this
/// group, so restarts resume where the previous run left off.
struct BotAgentTriggersConsumerGroup;

impl GroupName for BotAgentTriggersConsumerGroup {
    const GROUP_NAME: &'static str = "bot-agent-triggers";
}

type MentionKafkaAdapter =
    KafkaConsumerAdapter<BotAgentTriggersConsumerGroup, DeclaredMentionEvent>;
type MentionKafkaConsumer = MacroEventConsumerService<DeclaredMentionEvent, MentionKafkaAdapter>;

macro_event_broker::declare_topics!(DeclaredMentionEvent: MentionMacroEvent);

/// Maximum in-process attempts per mention before the consumer bails out and
/// lets a restart redeliver from the last committed offset.
const MAX_TRIGGER_ATTEMPTS: u32 = 5;

/// Delay before the first retry; doubles on each subsequent retry. The
/// worst-case total backoff (1+2+4+8 = 15s) stays well under librdkafka's
/// default `max.poll.interval.ms` (300s), so retrying never evicts this
/// consumer from its group.
const TRIGGER_RETRY_BASE_DELAY: Duration = Duration::from_secs(1);

/// Commit `message`'s offset, logging the outcome.
fn commit_logged(consumer: &MentionKafkaConsumer, message: &BorrowedMessage<'_>) {
    match consumer.inner().commit_message(message, CommitMode::Async) {
        Ok(()) => tracing::trace!(
            partition = message.partition(),
            offset = message.offset(),
            "committed offset"
        ),
        Err(error) => tracing::error!(
            error = ?error,
            partition = message.partition(),
            offset = message.offset(),
            "failed to commit offset"
        ),
    }
}

/// Trigger agents for one decoded mention event, retrying transient failures
/// with exponential backoff.
///
/// Returns `Ok(())` when the mention was handled or skipped (safe to commit)
/// and `Err` when a transient failure survived every attempt — the caller
/// must exit without committing so the event is redelivered.
async fn trigger_with_retry<C, A, R, B>(
    service: &BotMentionTriggerService<C, A, R, B>,
    event: &DeclaredMentionEvent,
    partition: i32,
    offset: i64,
) -> anyhow::Result<()>
where
    C: ChannelService + 'static,
    A: AgentResponder + Send + Sync + 'static,
    R: BotRepo,
    B: MacroEventBroker,
{
    let DeclaredMentionEvent::MentionMacroEvent(event) = event;
    let mut delay = TRIGGER_RETRY_BASE_DELAY;
    let mut attempt = 1u32;
    loop {
        tracing::trace!(partition, offset, attempt, "handling mention event");
        match service.handle_event(&event.event().event).await {
            Ok(outcome) => {
                tracing::trace!(
                    partition,
                    offset,
                    attempt,
                    ?outcome,
                    "mention event handled"
                );
                return Ok(());
            }
            Err(error) if attempt < MAX_TRIGGER_ATTEMPTS => {
                tracing::warn!(
                    error = ?error,
                    partition,
                    offset,
                    attempt,
                    delay_secs = delay.as_secs_f32(),
                    "transient bot trigger failure, retrying"
                );
                tokio::time::sleep(delay).await;
                delay *= 2;
                attempt += 1;
            }
            Err(error) => {
                return Err(anyhow::Error::from(error)).with_context(|| {
                    format!(
                        "transient bot trigger failure persisted after \
                         {MAX_TRIGGER_ATTEMPTS} attempts \
                         (partition {partition} offset {offset})"
                    )
                });
            }
        }
    }
}

/// Run the bot mention consumer until `shutdown` resolves.
///
/// Connects to `brokers` and subscribes to the topic declared by
/// [`MentionMacroEvent`] under the `bot-agent-triggers` consumer group. Every
/// decoded event is fed to `service`, committing each offset only after the
/// mention was handled or skipped (see `trigger_with_retry` for the retry
/// policy). Returns an error when the consumer cannot be created or
/// subscribed, or when a transient failure exhausts its in-process retries;
/// callers should treat that as fatal and restart, which redelivers the
/// uncommitted event. Pass `std::future::pending()` as `shutdown` to run until
/// the process exits.
pub async fn run_bot_mention_consumer<C, A, R, B>(
    brokers: &str,
    service: BotMentionTriggerService<C, A, R, B>,
    shutdown: impl Future<Output = ()> + Send,
) -> anyhow::Result<()>
where
    C: ChannelService + 'static,
    A: AgentResponder + Send + Sync + 'static,
    R: BotRepo,
    B: MacroEventBroker,
{
    let consumer = KafkaEventConsumer::<BotAgentTriggersConsumerGroup>::from_env(brokers)?;
    let consumer = KafkaConsumerAdapter::<BotAgentTriggersConsumerGroup, ()>::new(consumer)
        .subscribe::<DeclaredMentionEvent>()
        .map_err(|error| anyhow::anyhow!("failed to subscribe to mention topics: {error:?}"))?;
    let consumer = MentionKafkaConsumer::new(consumer);
    tracing::info!(
        topics = ?DeclaredMentionEvent::topics(),
        group = BotAgentTriggersConsumerGroup::GROUP_NAME,
        "bot mention consumer listening"
    );

    let mut shutdown = std::pin::pin!(shutdown);
    loop {
        tokio::select! {
            _ = &mut shutdown => {
                tracing::info!("bot mention consumer shutting down");
                break;
            }
            result = consumer.recv() => {
                let message = match result {
                    Ok(message) => message,
                    Err(e) => {
                        tracing::error!(error = ?e, "kafka receive error");
                        continue;
                    }
                };
                let kafka_message = message.inner();
                match message.decode_payload() {
                    Ok(event) => {
                        tracing::trace!(
                            partition = kafka_message.partition(),
                            offset = kafka_message.offset(),
                            "decoded mention event"
                        );
                        trigger_with_retry(
                            &service,
                            &event,
                            kafka_message.partition(),
                            kafka_message.offset(),
                        )
                        .await?;
                    }
                    // Undecodable messages are logged and skipped rather than
                    // wedging the partition on a poison message.
                    Err(e) => tracing::error!(
                        error = ?e,
                        topic = kafka_message.topic(),
                        partition = kafka_message.partition(),
                        offset = kafka_message.offset(),
                        "failed to decode mention event"
                    ),
                }

                // Commit only after the mention was handled or skipped:
                // at-least-once, retried across restarts.
                commit_logged(&consumer, kafka_message);
            }
        }
    }

    Ok(())
}
