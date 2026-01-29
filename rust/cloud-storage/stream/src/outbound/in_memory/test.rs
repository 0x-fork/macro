use super::*;
use futures::StreamExt;
use std::pin::Pin;

/// Helper to collect items from the stream returned by read().
async fn collect_items<T>(
    store: &InMemoryStreamStore,
    stream_id: &StreamId,
    offset: Option<Offset>,
) -> Result<Vec<WithOffset<StreamItem<T>>>, InMemoryError>
where
    T: for<'de> Deserialize<'de> + Send + Sync + 'static,
{
    let stream = store.read::<T>(stream_id, offset).await?;
    let pinned: Pin<Box<_>> = Box::into_pin(stream);
    pinned
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<Vec<_>, _>>()
}

#[tokio::test]
async fn test_create_stream() {
    let store = InMemoryStreamStore::new();

    // Create a stream
    let stream_id = store.create().await.unwrap();

    // Stream ID should be a valid UUID
    assert!(!stream_id.is_empty());
    uuid::Uuid::parse_str(&stream_id).expect("stream ID should be a valid UUID");
}

#[tokio::test]
async fn test_create_multiple_streams() {
    let store = InMemoryStreamStore::new();

    // Create multiple streams
    let id1 = store.create().await.unwrap();
    let id2 = store.create().await.unwrap();
    let id3 = store.create().await.unwrap();

    // Each stream should have a unique ID
    assert_ne!(id1, id2);
    assert_ne!(id2, id3);
    assert_ne!(id1, id3);
}

#[tokio::test]
async fn test_append_and_read_single_item() {
    let store = InMemoryStreamStore::new();
    let stream_id = store.create().await.unwrap();

    // Append a single item
    let item = StreamItem::Item("hello".to_string());
    store.append(&stream_id, item.clone()).await.unwrap();

    // Read all items from the stream
    let items = collect_items::<String>(&store, &stream_id, None)
        .await
        .unwrap();

    // Should have exactly one item
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].offset, 1);
    assert_eq!(items[0].item, StreamItem::Item("hello".to_string()));
}

#[tokio::test]
async fn test_append_and_read_multiple_items() {
    let store = InMemoryStreamStore::new();
    let stream_id = store.create().await.unwrap();

    // Append multiple items
    store
        .append(&stream_id, StreamItem::Item("first".to_string()))
        .await
        .unwrap();
    store
        .append(&stream_id, StreamItem::Item("second".to_string()))
        .await
        .unwrap();
    store
        .append(&stream_id, StreamItem::Item("third".to_string()))
        .await
        .unwrap();

    // Read all items
    let items = collect_items::<String>(&store, &stream_id, None)
        .await
        .unwrap();

    assert_eq!(items.len(), 3);
    assert_eq!(items[0].item, StreamItem::Item("first".to_string()));
    assert_eq!(items[0].offset, 1);
    assert_eq!(items[1].item, StreamItem::Item("second".to_string()));
    assert_eq!(items[1].offset, 2);
    assert_eq!(items[2].item, StreamItem::Item("third".to_string()));
    assert_eq!(items[2].offset, 3);
}

#[tokio::test]
async fn test_read_from_offset() {
    let store = InMemoryStreamStore::new();
    let stream_id = store.create().await.unwrap();

    // Append multiple items
    store
        .append(&stream_id, StreamItem::Item("first".to_string()))
        .await
        .unwrap();
    store
        .append(&stream_id, StreamItem::Item("second".to_string()))
        .await
        .unwrap();
    store
        .append(&stream_id, StreamItem::Item("third".to_string()))
        .await
        .unwrap();
    store
        .append(&stream_id, StreamItem::Item("fourth".to_string()))
        .await
        .unwrap();

    // Read from offset 2 (should get items after offset 2)
    let items = collect_items::<String>(&store, &stream_id, Some(2))
        .await
        .unwrap();

    assert_eq!(items.len(), 2);
    assert_eq!(items[0].item, StreamItem::Item("third".to_string()));
    assert_eq!(items[0].offset, 3);
    assert_eq!(items[1].item, StreamItem::Item("fourth".to_string()));
    assert_eq!(items[1].offset, 4);
}

#[tokio::test]
async fn test_read_from_last_offset_returns_empty() {
    let store = InMemoryStreamStore::new();
    let stream_id = store.create().await.unwrap();

    // Append items
    store
        .append(&stream_id, StreamItem::Item("first".to_string()))
        .await
        .unwrap();
    store
        .append(&stream_id, StreamItem::Item("second".to_string()))
        .await
        .unwrap();

    // Read from the last offset
    let items = collect_items::<String>(&store, &stream_id, Some(2))
        .await
        .unwrap();

    // Should return empty since there are no items after offset 2
    assert!(items.is_empty());
}

#[tokio::test]
async fn test_read_empty_stream() {
    let store = InMemoryStreamStore::new();
    let stream_id = store.create().await.unwrap();

    // Read from empty stream
    let items = collect_items::<String>(&store, &stream_id, None)
        .await
        .unwrap();

    assert!(items.is_empty());
}

#[tokio::test]
async fn test_stream_item_types() {
    let store = InMemoryStreamStore::new();
    let stream_id = store.create().await.unwrap();

    // Append different types of stream items
    store
        .append(&stream_id, StreamItem::Item("data".to_string()))
        .await
        .unwrap();
    store
        .append::<String>(
            &stream_id,
            StreamItem::Error("something went wrong".to_string()),
        )
        .await
        .unwrap();
    store
        .append::<String>(&stream_id, StreamItem::End)
        .await
        .unwrap();

    // Read all items
    let items = collect_items::<String>(&store, &stream_id, None)
        .await
        .unwrap();

    assert_eq!(items.len(), 3);
    assert_eq!(items[0].item, StreamItem::Item("data".to_string()));
    assert_eq!(
        items[1].item,
        StreamItem::Error("something went wrong".to_string())
    );
    assert_eq!(items[2].item, StreamItem::End);
}

#[tokio::test]
async fn test_append_to_nonexistent_stream() {
    let store = InMemoryStreamStore::new();

    // Try to append to a stream that doesn't exist
    let result = store
        .append(
            &"nonexistent".to_string(),
            StreamItem::Item("test".to_string()),
        )
        .await;

    assert!(matches!(result, Err(InMemoryError::StreamNotFound(_))));
}

#[tokio::test]
async fn test_read_from_nonexistent_stream() {
    let store = InMemoryStreamStore::new();

    // Try to read from a stream that doesn't exist
    let result = collect_items::<String>(&store, &"nonexistent".to_string(), None).await;

    assert!(matches!(result, Err(InMemoryError::StreamNotFound(_))));
}

#[tokio::test]
async fn test_invalid_offset() {
    let store = InMemoryStreamStore::new();
    let stream_id = store.create().await.unwrap();

    store
        .append(&stream_id, StreamItem::Item("test".to_string()))
        .await
        .unwrap();

    // Try to read with an invalid offset (beyond the stream length)
    let result = collect_items::<String>(&store, &stream_id, Some(999)).await;

    assert!(matches!(result, Err(InMemoryError::InvalidOffset(_))));

    // Try with offset 0 (offsets are 1-based)
    let result = collect_items::<String>(&store, &stream_id, Some(0)).await;

    assert!(matches!(result, Err(InMemoryError::InvalidOffset(_))));
}

#[tokio::test]
async fn test_complex_data_types() {
    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    struct Message {
        id: u64,
        content: String,
        tags: Vec<String>,
    }

    let store = InMemoryStreamStore::new();
    let stream_id = store.create().await.unwrap();

    let msg1 = Message {
        id: 1,
        content: "Hello world".to_string(),
        tags: vec!["greeting".to_string(), "test".to_string()],
    };
    let msg2 = Message {
        id: 2,
        content: "Goodbye".to_string(),
        tags: vec!["farewell".to_string()],
    };

    store
        .append(&stream_id, StreamItem::Item(msg1.clone()))
        .await
        .unwrap();
    store
        .append(&stream_id, StreamItem::Item(msg2.clone()))
        .await
        .unwrap();

    let items = collect_items::<Message>(&store, &stream_id, None)
        .await
        .unwrap();

    assert_eq!(items.len(), 2);
    assert_eq!(items[0].item, StreamItem::Item(msg1));
    assert_eq!(items[1].item, StreamItem::Item(msg2));
}

#[tokio::test]
async fn test_streams_are_isolated() {
    let store = InMemoryStreamStore::new();

    let stream1 = store.create().await.unwrap();
    let stream2 = store.create().await.unwrap();

    // Append to stream1
    store
        .append(&stream1, StreamItem::Item("stream1-item".to_string()))
        .await
        .unwrap();

    // Append to stream2
    store
        .append(&stream2, StreamItem::Item("stream2-item".to_string()))
        .await
        .unwrap();

    // Each stream should only contain its own items
    let items1 = collect_items::<String>(&store, &stream1, None)
        .await
        .unwrap();
    let items2 = collect_items::<String>(&store, &stream2, None)
        .await
        .unwrap();

    assert_eq!(items1.len(), 1);
    assert_eq!(items1[0].item, StreamItem::Item("stream1-item".to_string()));

    assert_eq!(items2.len(), 1);
    assert_eq!(items2[0].item, StreamItem::Item("stream2-item".to_string()));
}
