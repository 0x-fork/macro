use crate::domain::*;
use async_stream::stream;
use async_trait::async_trait;
use redis::{streams::StreamReadReply, AsyncCommands, Client, RedisResult, Value};
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;
mod ext;

#[derive(Debug, Clone)]
pub struct RedisStreamService {
    client: Arc<Client>,
}

// block for 5 min max
const MAX_BLOCK_MS: usize = 1000 * 60 * 5;
const KEY: &str = "value";

#[async_trait]
impl<T> StreamService<T> for RedisStreamService
where
    T: Serialize + DeserializeOwned + std::fmt::Debug + Send + Sync + 'static,
{
    async fn append(&self, id: &StreamId, item: T) -> Result<ItemId> {
        //todo remove expect
        let json = serde_json::to_string(&item).expect("json");
        self.client
            .get_multiplexed_async_connection()
            .await?
            .xadd(id.to_string(), "*", &[(KEY, json)])
            .await
            .map_err(Into::into)
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
                                                    match serde_json::from_str::<T>(&json_str) {
                                                        Ok(item) => yield item,
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
}
