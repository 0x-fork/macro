use super::util::StreamGuard;
use crate::domain::{StreamManager, StreamRepo};
use crate::outbound::redis::*;
use serial_test::serial;
use std::time::Duration;
use tokio::sync::mpsc;

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_no_streams() {
    // subscription / unsubscription with no streams
    // with no streams subscribing should save the sender-id pair with it's entity
    // so that if a stream starts it can be wired up
    // this test just validates that subscription / unsubscription correctly saves pair:entity

    let (service, _stream_id, _guard) = StreamGuard::new("manager_no_streams").await;
    let manager = RedisStreamManager::new(service);

    let (tx, mut rx) = mpsc::channel::<serde_json::Value>(10);

    // Subscribe to an entity with no active streams
    manager
        .clone()
        .subscribe("entity_1".into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

    // No messages should be received since there are no streams
    let result = tokio::time::timeout(Duration::from_millis(100), rx.recv()).await;
    assert!(result.is_err(), "should timeout with no messages");

    // Unsubscribe should succeed
    manager
        .clone()
        .unsubscribe("entity_1", "sender_1")
        .await
        .expect("unsubscribe should succeed");
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_sub_then_start() {
    // test subscribers subing to an entity then a stream starting on that entity

    let entity_id = "manager_sub_then_start";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;
    let manager = RedisStreamManager::new(service.clone());

    let (tx, mut rx) = mpsc::channel::<serde_json::Value>(10);

    // Subscribe before any stream exists
    manager
        .clone()
        .subscribe(entity_id.into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

    // Give the notification listener time to start
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Now create a stream by appending to it
    let item = serde_json::json!({"message": "hello from stream"});
    service
        .append(&stream_id, item.clone())
        .await
        .expect("append should succeed");

    // The subscriber should receive the item via the notification mechanism
    let received = tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("should receive message")
        .expect("channel should not be closed");

    assert_eq!(received, item);
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_sub_then_start_unrelated() {
    // test subscribers subing to an entity then a stream starting on a different entity

    let (service, stream_id, _guard) = StreamGuard::new("manager_unrelated_entity").await;
    let manager = RedisStreamManager::new(service.clone());

    let (tx, mut rx) = mpsc::channel::<serde_json::Value>(10);

    // Subscribe to a DIFFERENT entity than the stream
    manager
        .clone()
        .subscribe("different_entity".into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

    tokio::time::sleep(Duration::from_millis(50)).await;

    // Create a stream on the original entity (not the one we subscribed to)
    let item = serde_json::json!({"message": "should not receive"});
    service
        .append(&stream_id, item)
        .await
        .expect("append should succeed");

    // Subscriber should NOT receive anything since it's subscribed to a different entity
    let result = tokio::time::timeout(Duration::from_millis(500), rx.recv()).await;
    assert!(
        result.is_err(),
        "should timeout - no messages for unrelated entity"
    );
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_start_then_sub() {
    // test a stream starting then joining an entity
    // this should immediately spawn wire stream to sender

    let entity_id = "manager_start_then_sub";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;

    // First, create the stream and add items BEFORE subscribing
    let item1 = serde_json::json!({"message": "first"});
    let item2 = serde_json::json!({"message": "second"});

    service
        .append(&stream_id, item1.clone())
        .await
        .expect("append should succeed");
    service
        .append(&stream_id, item2.clone())
        .await
        .expect("append should succeed");

    // Now create manager and subscribe
    let manager = RedisStreamManager::new(service.clone());
    let (tx, mut rx) = mpsc::channel::<serde_json::Value>(10);

    manager
        .clone()
        .subscribe(entity_id.into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

    // Should receive both items that were already in the stream
    let received1 = tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("should receive first message")
        .expect("channel should not be closed");
    assert_eq!(received1, item1);

    let received2 = tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("should receive second message")
        .expect("channel should not be closed");
    assert_eq!(received2, item2);
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_connection_closed() {
    // we won't know that a connection is closed until we try to send to it
    // when we discover that it's closed the id-connection pair should be removed

    let entity_id = "manager_connection_closed";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;
    let manager = RedisStreamManager::new(service.clone());

    // Create a channel and immediately drop the receiver to simulate closed connection
    let (tx, rx) = mpsc::channel::<serde_json::Value>(1);
    drop(rx);

    manager
        .clone()
        .subscribe(entity_id.into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

    tokio::time::sleep(Duration::from_millis(50)).await;

    // Append to trigger a send attempt to the closed channel
    service
        .append(&stream_id, serde_json::json!({"test": "data"}))
        .await
        .expect("append should succeed");

    // Give time for the send to fail and cleanup to happen
    tokio::time::sleep(Duration::from_millis(200)).await;

    // The manager should have cleaned up internally
    // We can verify by subscribing a new connection - it should work fine
    let (tx2, mut rx2) = mpsc::channel::<serde_json::Value>(10);
    manager
        .clone()
        .subscribe(entity_id.into(), "sender_2".into(), tx2)
        .await
        .expect("new subscribe should succeed");

    // Append another item
    let item = serde_json::json!({"test": "after_cleanup"});
    service
        .append(&stream_id, item.clone())
        .await
        .expect("append should succeed");

    // New subscriber should receive it
    let received = tokio::time::timeout(Duration::from_secs(2), rx2.recv())
        .await
        .expect("should receive message")
        .expect("channel should not be closed");

    // Should receive either the first item (from stream_from_beginning) or the new one
    assert!(received == serde_json::json!({"test": "data"}) || received == item);
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_unsub_during_stream() {
    // test that unsubscribing kills the stream future / stops sending

    let entity_id = "manager_unsub_during";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;
    let manager = RedisStreamManager::new(service.clone());

    let (tx, mut rx) = mpsc::channel::<serde_json::Value>(10);

    // Create stream with initial item
    let item1 = serde_json::json!({"seq": 1});
    service
        .append(&stream_id, item1.clone())
        .await
        .expect("append should succeed");

    // Subscribe
    manager
        .clone()
        .subscribe(entity_id.into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

    // Receive first item
    let received = tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("should receive message")
        .expect("channel should not be closed");
    assert_eq!(received, item1);

    // Unsubscribe while stream is still active
    manager
        .clone()
        .unsubscribe(entity_id, "sender_1")
        .await
        .expect("unsubscribe should succeed");

    // Append more items
    service
        .append(&stream_id, serde_json::json!({"seq": 2}))
        .await
        .expect("append should succeed");

    // Should not receive any more items after unsubscribe
    let result = tokio::time::timeout(Duration::from_millis(500), rx.recv()).await;
    // Either timeout (task killed) or channel closed (task killed and dropped sender)
    match result {
        Err(_) => {}   // Timeout - expected if task was killed
        Ok(None) => {} // Channel closed - also acceptable
        Ok(Some(_)) => panic!("should not receive messages after unsubscribe"),
    }
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_unsub_concurrent_create() {
    // IGNORE for now
    // not sure how to test this yet, but there's an edge case where a stream
    // starts at the same instant as a connection unsubs. this should have same
    // behavior as test_unsub_during_stream
}
