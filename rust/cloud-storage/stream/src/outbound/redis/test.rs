use super::*;
use crate::domain::StreamService;
use futures::StreamExt;
use serial_test::serial;
use std::time::Duration;

struct StreamGuard {
    service: Arc<RedisStreamService>,
    stream_id: StreamId,
}

impl StreamGuard {
    pub async fn new(name: &str) -> (Arc<dyn StreamService<serde_json::Value>>, StreamId, Self) {
        let redis_url = std::env::var("REDIS_URL").expect("redis url");
        let client = Client::open(redis_url).expect("Failed to create Redis client");
        let service = Arc::new(
            RedisStreamService::new(client)
                .await
                .expect("Failed to create service"),
        );

        let stream_id = StreamId {
            entity_id: name.into(),
            stream_id: name.into(),
        };
        let guard = Self {
            service: service.clone(),
            stream_id: stream_id.clone(),
        };
        (service, stream_id, guard)
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
                    let _ = service.cleanup_stream(&stream_id).await;
                });
        })
        .join();
    }
}

/// Integration test for RedisStreamService - requires a running Redis instance.
/// Run with: REDIS_URL=redis://localhost:6379 cargo test -p stream -- --ignored
#[tokio::test]
#[serial]
async fn test_redis_stream_service_append_and_read() {
    let (service, stream_id, _guard) = StreamGuard::new("append_and_read").await;

    let item1 = serde_json::json!({"message": "hello", "count": 1});
    let item2 = serde_json::json!({"message": "world", "count": 2});

    service
        .append(&stream_id, item1.clone())
        .await
        .expect("Failed to append item1");

    service
        .append(&stream_id, item2.clone())
        .await
        .expect("Failed to append item2");

    service
        .close(&stream_id)
        .await
        .expect("failed to close stream");

    // Read items back from the stream
    let mut stream = service
        .stream_from_beginning(&stream_id)
        .await
        .expect("Failed to create stream");

    let timeout = Duration::from_secs(5);
    let received1 = tokio::time::timeout(timeout, stream.next())
        .await
        .expect("Timeout waiting for item1")
        .expect("Stream ended unexpectedly");

    let received2 = tokio::time::timeout(timeout, stream.next())
        .await
        .expect("Timeout waiting for item2")
        .expect("Stream ended unexpectedly");

    let end = tokio::time::timeout(timeout, stream.next())
        .await
        .expect("Timed out waiting for end");

    assert_eq!(received1, item1);
    assert_eq!(received2, item2);
    assert!(end.is_none());
}

#[tokio::test]
#[serial]
async fn test_from_async_stream() {
    let (service, stream_id, _guard) = StreamGuard::new("from_async_stream").await;

    let items: Vec<serde_json::Value> = (1..=5).map(|i| serde_json::json!({"index": i})).collect();

    let input_stream = futures::stream::iter(items.clone());
    let handle = service
        .clone()
        .from_async_stream(stream_id.clone(), Box::pin(input_stream), None);

    handle.await.expect("from_async_stream task failed");

    let mut output_stream = service
        .stream_from_beginning(&stream_id)
        .await
        .expect("Failed to create stream");

    let timeout = Duration::from_secs(5);
    for (i, expected) in items.iter().enumerate() {
        let received = tokio::time::timeout(timeout, output_stream.next())
            .await
            .unwrap_or_else(|_| panic!("Timeout waiting for item {}", i + 1))
            .unwrap_or_else(|| panic!("Stream ended unexpectedly at item {}", i + 1));
        assert_eq!(&received, expected, "Mismatch at item {}", i + 1);
    }

    let end = tokio::time::timeout(timeout, output_stream.next())
        .await
        .expect("Timeout waiting for stream end");
    assert!(end.is_none(), "Expected stream to be closed after 5 items");
}

#[tokio::test]
#[serial]
async fn test_notify_only_on_new_stream() {
    let (service, stream_id, _guard) = StreamGuard::new("notify_test").await;

    let mut notify = service.notify();

    // First append creates a new stream - should notify
    service
        .append(&stream_id, serde_json::json!({"item": 1}))
        .await
        .expect("Failed to append first item");

    let timeout = Duration::from_millis(500);
    tokio::time::timeout(timeout, notify.changed())
        .await
        .expect("Timeout waiting for notification on new stream")
        .expect("Notify channel closed");

    let notified_id = notify.borrow().clone();
    assert_eq!(notified_id.entity_id, stream_id.entity_id);
    assert_eq!(notified_id.stream_id, stream_id.stream_id);

    // Additional appends to same stream - should NOT notify
    for i in 2..=5 {
        service
            .append(&stream_id, serde_json::json!({"item": i}))
            .await
            .unwrap_or_else(|_| panic!("Failed to append item {}", i));
    }

    let result = tokio::time::timeout(timeout, notify.changed()).await;
    assert!(
        result.is_err(),
        "Should not receive notification when appending to existing stream"
    );
}

#[tokio::test]
#[serial]
async fn test_notify_on_multiple_new_streams() {
    let (_, stream_id1, _) = StreamGuard::new("notify_multi_1").await;
    let (service, stream_id2, _) = StreamGuard::new("notify_multi_2").await;

    let mut notify = service.notify();
    let timeout = Duration::from_millis(500);

    // First stream creation - should notify
    service
        .append(&stream_id1, serde_json::json!({"stream": 1}))
        .await
        .expect("Failed to append to stream 1");

    tokio::time::timeout(timeout, notify.changed())
        .await
        .expect("Timeout waiting for notification on first stream")
        .expect("Notify channel closed");

    let notified = notify.borrow().clone();
    assert_eq!(notified.entity_id, stream_id1.entity_id);

    // Second stream creation - should notify
    service
        .append(&stream_id2, serde_json::json!({"stream": 2}))
        .await
        .expect("Failed to append to stream 2");

    tokio::time::timeout(timeout, notify.changed())
        .await
        .expect("Timeout waiting for notification on second stream")
        .expect("Notify channel closed");

    let notified = notify.borrow().clone();
    assert_eq!(notified.entity_id, stream_id2.entity_id);
}
