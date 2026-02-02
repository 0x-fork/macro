use crate::domain::*;
use async_stream::stream;
use async_trait::async_trait;
use futures::StreamExt;
use redis::{streams::StreamReadReply, AsyncCommands, Client, RedisResult, Value};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::watch::{self, Receiver};
mod ext;

#[cfg(test)]
#[cfg(feature = "redis-test")]
mod test;

const NOTIFY_CHANNEL: &str = "stream:notifications";

#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
enum StreamItem<T> {
    Value(T),
    End,
}

/// Redis-backed stream service using Redis Streams for storage and Pub/Sub for notifications.
#[derive(Debug, Clone)]
pub struct RedisStreamService {
    client: Arc<Client>,
    notify_tx: Arc<watch::Sender<StreamId>>,
}

// block for 5 min max
const MAX_BLOCK_MS: usize = 1000 * 60 * 5;
const KEY: &str = "item";

impl RedisStreamService {
    /// Create a new Redis stream service and start the background subscriber.
    pub async fn new(client: Client) -> Result<Self> {
        let client = Arc::new(client);
        let (notify_tx, _) = watch::channel(StreamId {
            entity_id: String::new(),
            stream_id: String::new(),
        });
        let notify_tx = Arc::new(notify_tx);

        // Start background subscriber
        let sub_client = client.clone();
        let sub_tx = notify_tx.clone();
        tokio::spawn(async move {
            Self::run_subscriber(sub_client, sub_tx).await;
        });

        Ok(Self { client, notify_tx })
    }

    async fn run_subscriber(client: Arc<Client>, tx: Arc<watch::Sender<StreamId>>) {
        loop {
            match client.get_async_pubsub().await {
                Ok(mut pubsub) => {
                    if pubsub.subscribe(NOTIFY_CHANNEL).await.is_err() {
                        continue;
                    }
                    let mut stream = pubsub.on_message();
                    while let Some(msg) = stream.next().await {
                        if let Ok(payload) = msg.get_payload::<String>() {
                            if let Ok(stream_id) = serde_json::from_str::<StreamId>(&payload) {
                                let _ = tx.send(stream_id);
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::error!(error=?e, "failed to connect to pubsub");
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
            }
        }
    }

    pub fn obj<T>(self) -> Arc<dyn StreamService<T>>
    where
        T: Serialize + DeserializeOwned + std::fmt::Debug + Send + Sync + 'static,
    {
        Arc::new(self)
    }

    /// Delete stream data from redis
    /// Internal / testing only. Streams are cleaned using TTL for prod
    #[allow(unused)]
    async fn cleanup_stream(&self, id: &StreamId) -> Result<()> {
        let mut conn = self.client.get_multiplexed_async_connection().await?;
        conn.del(id.to_string())
            .await
            .map_err(|e| StreamServiceError::StorageError(e.into()))
    }

    async fn publish_item<T>(
        conn: &mut redis::aio::MultiplexedConnection,
        id: &StreamId,
        item: &StreamItem<T>,
    ) -> Result<ItemId>
    where
        T: Serialize + DeserializeOwned + std::fmt::Debug + Send + Sync + 'static,
    {
        let json = serde_json::to_string(item).map_err(StreamServiceError::SerdeError)?;
        conn.xadd(id.to_string(), "*", &[(KEY, json)])
            .await
            .map_err(|e| StreamServiceError::StorageError(e.into()))
    }
}

#[async_trait]
impl<T> StreamService<T> for RedisStreamService
where
    T: Serialize + DeserializeOwned + std::fmt::Debug + Send + Sync + 'static,
{
    /// create and append to stream or append to stream
    async fn append(&self, id: &StreamId, item: T) -> Result<ItemId> {
        let mut conn = self.client.get_multiplexed_async_connection().await?;

        let is_new: bool = !conn
            .exists(id.to_string())
            .await
            .map_err(|e| StreamServiceError::StorageError(e.into()))?;

        let item_id = Self::publish_item(&mut conn, id, &StreamItem::Value(item)).await?;

        if is_new {
            println!("new stream notify!");
            let notification = serde_json::to_string(id).expect("json");
            let _: RedisResult<()> = conn.publish(NOTIFY_CHANNEL, notification).await;
        }

        Ok(item_id)
    }

    async fn stream_from_beginning(&self, id: &StreamId) -> Result<ItemStream<T>> {
        let mut connection = self.client.get_multiplexed_async_connection().await?;
        let stream_key = id.to_string();

        let stream = stream! {
            let mut last_id = "0".to_string();

            loop {
                let opts = redis::streams::StreamReadOptions::default().block(MAX_BLOCK_MS);

                let result: RedisResult<StreamReadReply> = connection
                    .xread_options(&[&stream_key], &[&last_id], &opts)
                    .await;

                match result {
                    Ok(reply) => {
                        for stream_key in reply.keys {
                            for stream_id in stream_key.ids {
                                last_id = stream_id.id.clone();

                                for (key, value) in stream_id.map {
                                    if key == KEY {
                                        if let Value::BulkString(bytes) = value {
                                            match String::from_utf8(bytes) {
                                                Ok(json_str) => {
                                                    match serde_json::from_str::<StreamItem<T>>(&json_str) {
                                                        Ok(item) => match item {
                                                           StreamItem::Value(t)  => yield t,
                                                           StreamItem::End => return
                                                        }
                                                        Err(e) => {
                                                            tracing::error!(error=?e, "failed to deserialize stream item");
                                                        }
                                                    }
                                                }
                                                Err(e) => {
                                                    tracing::error!(error=?e, "invalid UTF-8 in stream item");
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!(error=?e, "failed to read from stream");
                        break;
                    }
                }
            }
        };
        Ok(Box::pin(stream))
    }

    async fn close(&self, id: &StreamId) -> Result<()> {
        let mut conn = self.client.get_multiplexed_async_connection().await?;
        Self::publish_item(&mut conn, id, &StreamItem::<()>::End).await?;
        Ok(())
    }

    fn notify(&self) -> Receiver<StreamId> {
        self.notify_tx.subscribe()
    }
}
