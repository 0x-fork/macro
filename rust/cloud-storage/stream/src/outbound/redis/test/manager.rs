use super::util::StreamGuard;
use crate::domain::{StreamId, StreamManager, StreamManagerExt};
use crate::outbound::redis::*;
use serial_test::serial;
use std::sync::Arc;
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

    let (tx, mut rx) = mpsc::channel::<StreamItem>(10);

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
async fn test_sub_then_start_related() {
    // test subscribers subing to an entity then a stream starting on that entity

    let entity_id = "manager_sub_then_start";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;
    let manager = RedisStreamManager::new(service.clone());

    let (tx, mut rx) = mpsc::channel::<StreamItem>(10);

    // Subscribe before any stream exists
    manager
        .clone()
        .subscribe(entity_id.into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

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

    assert_eq!(received.payload, item);
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_sub_then_start_unrelated() {
    // test subscribers subing to an entity then a stream starting on a different entity

    let (service, stream_id, _guard) = StreamGuard::new("manager_unrelated_entity").await;
    let manager = RedisStreamManager::new(service.clone());

    let (tx, mut rx) = mpsc::channel::<StreamItem>(10);

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
    let (tx, mut rx) = mpsc::channel::<StreamItem>(10);

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
    assert_eq!(received1.payload, item1);

    let received2 = tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("should receive second message")
        .expect("channel should not be closed");
    assert_eq!(received2.payload, item2);
}

// =============================================================================
// Late join tests
// =============================================================================

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_late_join_multiple_subscribers() {
    // Multiple subscribers join after stream already has data
    // All should receive all items from the beginning

    let entity_id = "late_join_multi";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;

    // Create stream with items BEFORE any subscribers
    let items: Vec<serde_json::Value> = (1..=5).map(|i| serde_json::json!({"seq": i})).collect();

    for item in &items {
        service
            .append(&stream_id, item.clone())
            .await
            .expect("append should succeed");
    }

    // Now create manager and subscribe multiple connections
    let manager = RedisStreamManager::new(service.clone());

    let (tx1, mut rx1) = mpsc::channel::<StreamItem>(10);
    let (tx2, mut rx2) = mpsc::channel::<StreamItem>(10);
    let (tx3, mut rx3) = mpsc::channel::<StreamItem>(10);

    // All subscribe after stream exists
    manager
        .clone()
        .subscribe(entity_id.into(), "sender_1".into(), tx1)
        .await
        .expect("subscribe should succeed");
    manager
        .clone()
        .subscribe(entity_id.into(), "sender_2".into(), tx2)
        .await
        .expect("subscribe should succeed");
    manager
        .clone()
        .subscribe(entity_id.into(), "sender_3".into(), tx3)
        .await
        .expect("subscribe should succeed");

    // Helper to collect all items from a receiver
    async fn collect_items(rx: &mut mpsc::Receiver<StreamItem>) -> Vec<serde_json::Value> {
        let mut received = Vec::new();
        while let Ok(Some(item)) = tokio::time::timeout(Duration::from_millis(500), rx.recv()).await
        {
            received.push(item.payload.clone());
        }
        received
    }

    let received1 = collect_items(&mut rx1).await;
    let received2 = collect_items(&mut rx2).await;
    let received3 = collect_items(&mut rx3).await;

    // All subscribers should receive all 5 items
    assert_eq!(received1.len(), 5, "subscriber 1 should get all 5 items");
    assert_eq!(received2.len(), 5, "subscriber 2 should get all 5 items");
    assert_eq!(received3.len(), 5, "subscriber 3 should get all 5 items");

    // Verify correct order
    for (i, item) in received1.iter().enumerate() {
        assert_eq!(item["seq"], i + 1, "items should be in order");
    }
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_late_join_multiple_streams_same_entity() {
    // Entity has multiple active streams
    // Late joiner should receive data from all streams

    let entity_id = "late_join_multi_streams";
    let (service, stream_id_1, guard) = StreamGuard::new(entity_id).await;

    // Create a second stream for the same entity
    let stream_id_2 = StreamId {
        entity_id: entity_id.into(),
        entity_type: model_entity::EntityType::Chat,
        stream_id: format!("{}_stream_2", entity_id),
    };
    guard.add_stream_id(stream_id_2.clone());

    // Add items to first stream
    service
        .append(&stream_id_1, serde_json::json!({"stream": 1, "seq": 1}))
        .await
        .expect("append should succeed");
    service
        .append(&stream_id_1, serde_json::json!({"stream": 1, "seq": 2}))
        .await
        .expect("append should succeed");

    // Add items to second stream
    service
        .append(&stream_id_2, serde_json::json!({"stream": 2, "seq": 1}))
        .await
        .expect("append should succeed");
    service
        .append(&stream_id_2, serde_json::json!({"stream": 2, "seq": 2}))
        .await
        .expect("append should succeed");

    // Late join - subscribe after both streams have data
    let manager = RedisStreamManager::new(service.clone());
    let (tx, mut rx) = mpsc::channel::<StreamItem>(20);

    manager
        .clone()
        .subscribe(entity_id.into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

    // Collect all received items
    let mut received = Vec::new();
    while let Ok(Some(item)) = tokio::time::timeout(Duration::from_millis(500), rx.recv()).await {
        received.push(item.payload.clone());
    }

    // Should receive items from both streams (4 total)
    assert_eq!(
        received.len(),
        4,
        "should receive all items from both streams"
    );

    // Count items per stream
    let stream1_count = received.iter().filter(|i| i["stream"] == 1).count();
    let stream2_count = received.iter().filter(|i| i["stream"] == 2).count();

    assert_eq!(stream1_count, 2, "should get 2 items from stream 1");
    assert_eq!(stream2_count, 2, "should get 2 items from stream 2");
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_late_join_during_active_streaming() {
    // Stream is actively receiving new items
    // Late joiner should get historical items AND new items

    let entity_id = "late_join_active";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;

    // Add initial items before any subscriber
    service
        .append(&stream_id, serde_json::json!({"phase": "before", "seq": 1}))
        .await
        .expect("append should succeed");
    service
        .append(&stream_id, serde_json::json!({"phase": "before", "seq": 2}))
        .await
        .expect("append should succeed");

    let manager = RedisStreamManager::new(service.clone());

    // First subscriber joins (early joiner for comparison)
    let (tx1, mut rx1) = mpsc::channel::<StreamItem>(20);
    manager
        .clone()
        .subscribe(entity_id.into(), "early_joiner".into(), tx1)
        .await
        .expect("subscribe should succeed");

    // Wait for early joiner to receive initial items
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Add more items while early joiner is connected
    service
        .append(&stream_id, serde_json::json!({"phase": "during", "seq": 3}))
        .await
        .expect("append should succeed");

    // Late joiner subscribes mid-stream
    let (tx2, mut rx2) = mpsc::channel::<StreamItem>(20);
    manager
        .clone()
        .subscribe(entity_id.into(), "late_joiner".into(), tx2)
        .await
        .expect("subscribe should succeed");

    // Add more items after late joiner
    service
        .append(&stream_id, serde_json::json!({"phase": "after", "seq": 4}))
        .await
        .expect("append should succeed");
    service
        .append(&stream_id, serde_json::json!({"phase": "after", "seq": 5}))
        .await
        .expect("append should succeed");

    // Collect items from both receivers
    async fn collect_items(rx: &mut mpsc::Receiver<StreamItem>) -> Vec<serde_json::Value> {
        let mut received = Vec::new();
        while let Ok(Some(item)) = tokio::time::timeout(Duration::from_millis(500), rx.recv()).await
        {
            received.push(item.payload.clone());
        }
        received
    }

    let early_received = collect_items(&mut rx1).await;
    let late_received = collect_items(&mut rx2).await;

    // Early joiner should get all 5 items
    assert_eq!(
        early_received.len(),
        5,
        "early joiner should get all 5 items"
    );

    // Late joiner should also get all 5 items (stream_from_beginning)
    assert_eq!(
        late_received.len(),
        5,
        "late joiner should get all 5 items from beginning"
    );

    // Verify late joiner got items in correct order
    for (i, item) in late_received.iter().enumerate() {
        assert_eq!(item["seq"], i + 1, "late joiner items should be in order");
    }
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
    let (tx, rx) = mpsc::channel::<StreamItem>(1);
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
    let (tx2, mut rx2) = mpsc::channel::<StreamItem>(10);
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
    assert!(received.payload == serde_json::json!({"test": "data"}) || received.payload == item);
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_unsub_during_stream() {
    // test that unsubscribing kills the stream future / stops sending

    let entity_id = "manager_unsub_during";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;
    let manager = RedisStreamManager::new(service.clone());

    let (tx, mut rx) = mpsc::channel::<StreamItem>(10);

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
    assert_eq!(received.payload, item1);

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

// =============================================================================
// Internal state verification tests
// =============================================================================

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_subscribe_unsubscribe_state() {
    // test subscribe correctly updates the subscribed_connections_map
    // test 0 streaming_connections (no streams exist)
    // test unsubscribe results in 0 len subscribed_connections_map

    let entity_id = "state_sub_unsub";
    let (service, _stream_id, _guard) = StreamGuard::new(entity_id).await;
    let manager = RedisStreamManager::new(service);

    let (tx, _rx) = mpsc::channel::<StreamItem>(10);

    // Initially both maps should be empty
    assert!(
        manager.subscribed_connections.is_empty(),
        "subscribed_connections should be empty initially"
    );
    assert!(
        manager.streaming_connections.is_empty(),
        "streaming_connections should be empty initially"
    );

    // Subscribe to entity
    manager
        .clone()
        .subscribe(entity_id.into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

    // subscribed_connections should have the entity with 1 connection
    assert_eq!(
        manager.subscribed_connections.len(),
        1,
        "should have 1 entity in subscribed_connections"
    );
    assert_eq!(
        manager
            .subscribed_connections
            .get(entity_id)
            .map(|set| set.len())
            .unwrap_or(0),
        1,
        "entity should have 1 connection"
    );

    // streaming_connections should still be empty (no active streams)
    assert!(
        manager.streaming_connections.is_empty(),
        "streaming_connections should be empty with no streams"
    );

    // Unsubscribe
    manager
        .clone()
        .unsubscribe(entity_id, "sender_1")
        .await
        .expect("unsubscribe should succeed");

    // subscribed_connections should have entity but with 0 connections
    let connection_count = manager
        .subscribed_connections
        .get(entity_id)
        .map(|set| set.len())
        .unwrap_or(0);
    assert_eq!(
        connection_count, 0,
        "entity should have 0 connections after unsubscribe"
    );
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_subscribe_unsubscribe_multi_state() {
    // test multiple subs to same entity (sub + unsub)
    // test multiple subs to different entities (sub + unsub)

    let entity_a = "state_multi_a";
    let entity_b = "state_multi_b";
    let (service, _stream_id, _guard) = StreamGuard::new(entity_a).await;
    let manager = RedisStreamManager::new(service);

    let (tx1, _rx1) = mpsc::channel::<StreamItem>(10);
    let (tx2, _rx2) = mpsc::channel::<StreamItem>(10);
    let (tx3, _rx3) = mpsc::channel::<StreamItem>(10);

    // Subscribe two connections to entity_a
    manager
        .clone()
        .subscribe(entity_a.into(), "sender_1".into(), tx1)
        .await
        .expect("subscribe should succeed");

    manager
        .clone()
        .subscribe(entity_a.into(), "sender_2".into(), tx2)
        .await
        .expect("subscribe should succeed");

    // Subscribe one connection to entity_b
    manager
        .clone()
        .subscribe(entity_b.into(), "sender_3".into(), tx3)
        .await
        .expect("subscribe should succeed");

    // Verify state
    assert_eq!(
        manager.subscribed_connections.len(),
        2,
        "should have 2 entities in subscribed_connections"
    );
    assert_eq!(
        manager
            .subscribed_connections
            .get(entity_a)
            .map(|set| set.len())
            .unwrap_or(0),
        2,
        "entity_a should have 2 connections"
    );
    assert_eq!(
        manager
            .subscribed_connections
            .get(entity_b)
            .map(|set| set.len())
            .unwrap_or(0),
        1,
        "entity_b should have 1 connection"
    );

    // Unsubscribe one from entity_a
    manager
        .clone()
        .unsubscribe(entity_a, "sender_1")
        .await
        .expect("unsubscribe should succeed");

    assert_eq!(
        manager
            .subscribed_connections
            .get(entity_a)
            .map(|set| set.len())
            .unwrap_or(0),
        1,
        "entity_a should have 1 connection after partial unsubscribe"
    );

    // Unsubscribe remaining from entity_a
    manager
        .clone()
        .unsubscribe(entity_a, "sender_2")
        .await
        .expect("unsubscribe should succeed");

    assert_eq!(
        manager
            .subscribed_connections
            .get(entity_a)
            .map(|set| set.len())
            .unwrap_or(0),
        0,
        "entity_a should have 0 connections after full unsubscribe"
    );

    // entity_b should still have its connection
    assert_eq!(
        manager
            .subscribed_connections
            .get(entity_b)
            .map(|set| set.len())
            .unwrap_or(0),
        1,
        "entity_b should still have 1 connection"
    );
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_stream_then_subscribe_state() {
    // create stream then sub to it
    // adds to both maps immediately on join

    let entity_id = "state_stream_then_sub";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;

    // Create stream first by appending to it
    let item = serde_json::json!({"message": "first"});
    service
        .append(&stream_id, item)
        .await
        .expect("append should succeed");

    // Now create manager and subscribe
    let manager = RedisStreamManager::new(service.clone());
    let (tx, mut rx) = mpsc::channel::<StreamItem>(10);

    manager
        .clone()
        .subscribe(entity_id.into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

    // Verify subscribed_connections has the connection
    assert_eq!(
        manager
            .subscribed_connections
            .get(entity_id)
            .map(|set| set.len())
            .unwrap_or(0),
        1,
        "should have 1 subscribed connection"
    );

    // Wait for stream to be wired up
    let _ = tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("should receive message");

    // Verify streaming_connections has the sender
    assert!(
        manager.streaming_connections.contains_key("sender_1"),
        "streaming_connections should contain sender_1"
    );
    assert!(
        manager
            .streaming_connections
            .get("sender_1")
            .map(|set| set.len() > 0)
            .unwrap_or(false),
        "sender_1 should have active stream tasks"
    );
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_unsub_mid_stream_state() {
    // removes from streaming_connections
    // removes from subscribed_connections

    let entity_id = "state_unsub_mid";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;

    // Create stream first
    service
        .append(&stream_id, serde_json::json!({"seq": 1}))
        .await
        .expect("append should succeed");

    let manager = RedisStreamManager::new(service.clone());
    let (tx, mut rx) = mpsc::channel::<StreamItem>(10);

    manager
        .clone()
        .subscribe(entity_id.into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

    // Wait for stream to start
    let _ = tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("should receive message");

    // Verify both maps have entries
    assert!(
        manager
            .subscribed_connections
            .get(entity_id)
            .map(|set| set.len() > 0)
            .unwrap_or(false),
        "should have subscribed connection before unsub"
    );
    assert!(
        manager.streaming_connections.contains_key("sender_1"),
        "should have streaming connection before unsub"
    );

    // Unsubscribe mid-stream
    manager
        .clone()
        .unsubscribe(entity_id, "sender_1")
        .await
        .expect("unsubscribe should succeed");

    // Verify subscribed_connections is cleared for this sender
    assert_eq!(
        manager
            .subscribed_connections
            .get(entity_id)
            .map(|set| set.len())
            .unwrap_or(0),
        0,
        "subscribed_connections should be empty after unsub"
    );

    // Verify streaming_connections is cleared for this sender
    assert!(
        !manager.streaming_connections.contains_key("sender_1"),
        "streaming_connections should not contain sender_1 after unsub"
    );
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_sub_stream_unrelated_state() {
    // subscribe to entity_a
    // start stream on entity_b
    // verify that there are no streaming_connections

    let entity_a = "state_unrelated_a";
    let entity_b = "state_unrelated_b";
    let (service, _stream_id_a, _guard_a) = StreamGuard::new(entity_a).await;
    let (_service_b, stream_id_b, _guard_b) = StreamGuard::new(entity_b).await;

    let manager = RedisStreamManager::new(service.clone());
    let (tx, _rx) = mpsc::channel::<StreamItem>(10);

    // Subscribe to entity_a
    manager
        .clone()
        .subscribe(entity_a.into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

    // Start stream on entity_b (unrelated)
    service
        .append(&stream_id_b, serde_json::json!({"unrelated": true}))
        .await
        .expect("append should succeed");

    // Verify subscribed_connections has entity_a
    assert!(
        manager.subscribed_connections.contains_key(entity_a),
        "subscribed_connections should contain entity_a"
    );

    // Verify streaming_connections is empty (no stream on entity_a)
    assert!(
        manager.streaming_connections.is_empty(),
        "streaming_connections should be empty for unrelated stream"
    );
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_stream_ends_close_state() {
    // add 3 connections
    // start stream to same entity
    // stream emits a few items then ends
    // verify streams complete and all items received

    let entity_id = "state_stream_ends";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;

    // Create stream first
    service
        .append(&stream_id, serde_json::json!({"seq": 1}))
        .await
        .expect("append should succeed");

    let manager = RedisStreamManager::new(service.clone());

    let (tx1, mut rx1) = mpsc::channel::<StreamItem>(10);
    let (tx2, mut rx2) = mpsc::channel::<StreamItem>(10);
    let (tx3, mut rx3) = mpsc::channel::<StreamItem>(10);

    // Subscribe all 3 connections
    manager
        .clone()
        .subscribe(entity_id.into(), "sender_1".into(), tx1)
        .await
        .expect("subscribe should succeed");
    manager
        .clone()
        .subscribe(entity_id.into(), "sender_2".into(), tx2)
        .await
        .expect("subscribe should succeed");
    manager
        .clone()
        .subscribe(entity_id.into(), "sender_3".into(), tx3)
        .await
        .expect("subscribe should succeed");

    // Give time for streaming tasks to be set up
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Verify all 3 are streaming
    assert_eq!(
        manager.streaming_connections.len(),
        3,
        "should have 3 streaming connections"
    );

    // Emit a few more items
    service
        .append(&stream_id, serde_json::json!({"seq": 2}))
        .await
        .expect("append should succeed");
    service
        .append(&stream_id, serde_json::json!({"seq": 3}))
        .await
        .expect("append should succeed");

    // End the stream
    service
        .close(&stream_id)
        .await
        .expect("close should succeed");

    // Helper to drain a receiver and count items
    async fn drain_and_count(rx: &mut mpsc::Receiver<StreamItem>) -> usize {
        let mut count = 0;
        while let Ok(Some(_)) = tokio::time::timeout(Duration::from_millis(500), rx.recv()).await {
            count += 1;
        }
        count
    }

    // Verify all receivers got all 3 items
    let count1 = drain_and_count(&mut rx1).await;
    let count2 = drain_and_count(&mut rx2).await;
    let count3 = drain_and_count(&mut rx3).await;

    assert_eq!(count1, 3, "receiver 1 should get all 3 items");
    assert_eq!(count2, 3, "receiver 2 should get all 3 items");
    assert_eq!(count3, 3, "receiver 3 should get all 3 items");

    // Note: streaming_connections entries remain in map after stream ends
    // (tasks complete but are not removed from the map)
    // This is expected behavior - cleanup only happens on unsubscribe or send failure
}

async fn util_test_stream_ends_state_exhausted(
    stream_id: StreamId,
    service: Arc<dyn crate::domain::StreamRepo>,
) {
    // Use from_async_stream with a finite stream (3 items)
    // This should have the same behavior as calling close explicitly

    // Track this stream for cleanup
    let entity_id = stream_id.entity_id.clone();

    // Get concrete service for extension trait

    let manager = RedisStreamManager::new(service.clone());

    let (tx1, mut rx1) = mpsc::channel::<StreamItem>(10);
    let (tx2, mut rx2) = mpsc::channel::<StreamItem>(10);
    let (tx3, mut rx3) = mpsc::channel::<StreamItem>(10);

    // Subscribe all 3 connections before stream exists
    manager
        .clone()
        .subscribe(entity_id.clone(), format!("1-{}", stream_id), tx1)
        .await
        .expect("subscribe should succeed");
    manager
        .clone()
        .subscribe(entity_id.clone(), format!("2-{}", stream_id), tx2)
        .await
        .expect("subscribe should succeed");
    manager
        .clone()
        .subscribe(entity_id.clone(), format!("3-{}", stream_id), tx3)
        .await
        .expect("subscribe should succeed");

    // Verify 3 subscribed connections, no streaming yet
    assert_eq!(
        manager
            .subscribed_connections
            .get(&entity_id)
            .map(|set| set.len())
            .unwrap_or(0),
        3,
        "should have 3 subscribed connections"
    );
    assert!(
        manager.streaming_connections.is_empty(),
        "streaming_connections should be empty before stream starts"
    );

    // Create a finite stream with 3 items using from_async_stream
    let items: Vec<serde_json::Value> = (1..=3).map(|i| serde_json::json!({"seq": i})).collect();
    let input_stream = futures::stream::iter(items.clone());

    service.from_async_stream(stream_id.clone(), Box::pin(input_stream), None);

    // Helper to drain a receiver and count items
    async fn drain_and_count(n: usize, rx: &mut mpsc::Receiver<StreamItem>) {
        let mut count = 0;
        while let Ok(Some(_)) = tokio::time::timeout(Duration::from_millis(1000), rx.recv()).await {
            count += 1;
        }
        assert_eq!(count, 3, "receiver {} should get all 3 items", n);
    }

    drain_and_count(1, &mut rx1).await;
    drain_and_count(2, &mut rx2).await;
    drain_and_count(3, &mut rx3).await;

    assert!(
        manager.streaming_connections.is_empty(),
        "No streaming connections"
    );
    assert_eq!(
        manager
            .subscribed_connections
            .iter()
            .map(|entity_map| entity_map.len())
            .sum::<usize>(),
        3,
        "3 subscribed connections"
    );
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_stream_exhausted_single() {
    let entity_id = "state_stream_exhausted_single";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;
    util_test_stream_ends_state_exhausted(stream_id, service).await;
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_disconnect_behavior_state() {
    // subscribe to entity
    // start stream on that entity
    // stream 3 items but kill the connection channel after the 1st item
    // validate that subscribed_connections empties and streaming_connections empties

    let entity_id = "state_disconnect";
    let (service, stream_id, _guard) = StreamGuard::new(entity_id).await;

    // Create stream first
    service
        .append(&stream_id, serde_json::json!({"seq": 1}))
        .await
        .expect("append should succeed");

    let manager = RedisStreamManager::new(service.clone());
    let (tx, rx) = mpsc::channel::<StreamItem>(1); // Small buffer to test backpressure

    manager
        .clone()
        .subscribe(entity_id.into(), "sender_1".into(), tx)
        .await
        .expect("subscribe should succeed");

    // Verify connection is in both maps
    assert!(
        manager
            .subscribed_connections
            .get(entity_id)
            .map(|set| set.len() > 0)
            .unwrap_or(false),
        "should have subscribed connection"
    );
    assert!(
        manager.streaming_connections.contains_key("sender_1"),
        "should have streaming connection"
    );

    // Drop the receiver to simulate disconnect
    drop(rx);

    // Append more items to trigger send failure
    service
        .append(&stream_id, serde_json::json!({"seq": 2}))
        .await
        .expect("append should succeed");
    service
        .append(&stream_id, serde_json::json!({"seq": 3}))
        .await
        .expect("append should succeed");

    // Verify subscribed_connections is cleared for this sender
    let subscribed_count = manager
        .subscribed_connections
        .get(entity_id)
        .map(|set| set.len())
        .unwrap_or(0);

    assert_eq!(
        subscribed_count, 0,
        "subscribed_connections should be empty after disconnect"
    );

    // Verify streaming_connections is cleared for this sender
    assert!(
        !manager.streaming_connections.contains_key("sender_1"),
        "streaming_connections should not contain sender_1 after disconnect"
    );
}

#[tokio::test(flavor = "multi_thread")]
#[serial]
async fn test_stream_exhausted_load() {
    // Load test: repeat the exhausted stream test 1000 times
    // Create one guard that will clean up all streams at the end
    let (service, _, guard) = StreamGuard::new("load_test_init").await;

    let tests = (0..50).map(|i| {
        // important to prevent tests from conflicting
        let id = format!("exaust_load_{}", i);
        let stream_id = StreamId {
            entity_id: id.clone(),
            entity_type: model_entity::EntityType::Chat,
            stream_id: id.clone(),
        };
        guard.add_stream_id(stream_id.clone());

        util_test_stream_ends_state_exhausted(stream_id, service.clone())
    });

    futures::future::join_all(tests).await;
}
