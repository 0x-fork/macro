use crate::domain::StreamRepo;
use crate::outbound::redis::*;
use redis::Client;
use std::sync::Arc;

pub struct StreamGuard {
    pub service: RedisStreamService,
    pub stream_id: StreamId,
}

impl StreamGuard {
    pub async fn new(name: &str) -> (Arc<dyn StreamRepo<serde_json::Value>>, StreamId, Self) {
        Self::new_with_stream_id(name, "stream").await
    }

    pub async fn new_with_stream_id(
        entity_id: &str,
        stream_id: &str,
    ) -> (Arc<dyn StreamRepo<serde_json::Value>>, StreamId, Self) {
        let service = connect_from_env().await;
        let service_external = connect_from_env().await;
        let stream_id = test_stream_id(entity_id, stream_id);

        let guard = Self {
            service: service,
            stream_id: stream_id.clone(),
        };

        (service_external.obj(), stream_id, guard)
    }
}

impl Drop for StreamGuard {
    fn drop(&mut self) {
        let service = self.service.clone();
        let stream_id = self.stream_id.clone();
        let _ = std::thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap()
                .block_on(async {
                    let _ = tokio::time::timeout(
                        std::time::Duration::from_millis(500),
                        service.cleanup_stream(&stream_id),
                    )
                    .await
                    .expect("timed out cleaning up stream");
                });
        })
        .join();
    }
}

pub async fn connect_from_env() -> RedisStreamService {
    let redis_url = std::env::var("REDIS_URL").expect("redis url");
    let client = Client::open(redis_url).expect("Failed to create Redis client");
    let service = RedisStreamService::new(client)
        .await
        .expect("Failed to create service");
    service
}

pub fn test_stream_id(entity_id: &str, stream_id: &str) -> StreamId {
    StreamId {
        entity_type: model_entity::EntityType::Chat,
        entity_id: entity_id.into(),
        stream_id: stream_id.into(),
    }
}
