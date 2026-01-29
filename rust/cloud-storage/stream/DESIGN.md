## Motivation

<m-document-card>{"documentId":"ba475b92-0339-488a-b8fb-1fa9f92717a1","blockName":"canvas","documentName":"Async AI C","blockParams":{},"previewBox":[768,400],"previewData":{"view":{"y":-649,"x":2,"scale":50}},"mentionUuid":"019bfbeb-8dd2-709a-a42d-19a80eb3fb0f"}</m-document-card>

Async AI would enable new features including

  - AI completion notifications
  - Triggering AI background tasks
  - Durable stream connect / disconnect handling

The current implementation is closely tied to a user's Websocket connection which is prohibitive to correct behavior on disconnect and stands in the way of a generally useful api that can be used outside the context of the frontend chat interface.


## Goals

- Disconnecting from an actively streaming chat will not delete / break the streaming message
  - Message correctly saves to db when stream completes
- Reconnect to an actively streaming chat 
  - Sync the missed changes with client
  - Continue to stream
- The same chat infrastructure that currently exists should be used to support both asynchronous and live chat chat responses
- Support an easily consumable API to run background AI responses

## Frontend Streaming API

The [Durable streams](https://github.com/durable-streams/durable-streams) project provides a good API and synchronization pattern between a streaming API and a dependent frontend. This project isn't well supported and doesn't supply necessary rust infrastructure so it's used as inspiration but likely won't be used in an actual implementation.

Connection to a stream is done with an http endpoint that uses SSE to send events back over the connection. 

```javascript
const handle = await DurableStream.create({
  url: "https://your-server.com/v1/stream/my-stream-id",
})
```

An optional offset may be provided to continue streaming from a last-known location.

```javascript
const handle = await DurableStream.create({
  url: "https://your-server.com/v1/stream/my-stream-id?offset=abc123xyz",
})
```

Alternatively a stream connection may be established and prior content flushed before continuing to consume the stream in real-time. Relying on backend infrastructure to replay past messages then resume live streaming seems like a simpler approach than saving offsets client side.

It's not necessary to switch from a websocket to SSE to achieve this API so the protocol on the frontend would start with an http exchange before streaming content via websocket.

```plaintext
POST /chat/{id}/message -> { stream_id: string, ... } 
```

## Streaming as a service

A streaming service provides support for reconnection, replay, and replay from offset. 

```rust
pub type StreamId = String;

#[derive(...)]
pub enum StreamItem<T> {
	Item<T>,
	Error(String),
	End
}

#[derive(...)]
pub struct WithOffset<T> {
	pub item: T,
	pub offset: String
}

pub type StreamWithOffset<T,E> = 
	Box<dyn Stream<Item = Result<WithOffset<StreamItem<T>>, E>>>;

pub trait StreamService {
	type Error;
	fn create(&mut self) 
		-> impl Future<Output = Result<StreamId, Self::Error>>;
	
	fn append<T>(&mut self, item: StreamItem<T>) 
	where
		T: Serialize + Deserialize,
		-> impl Future<Output = Result<(), Self::Error>>;
	

	fn read<T>(&mut self, 
		id: StreamId,
		offset: Option<String>
	) 
	where
		T: Serialize + Deserialize
		-> impl Future<Output = Result<
			StreamWithOffset<T, Self::Error>, Self::Error>>;
}
```

An implementation of this service would need a storage layer and to provide guarantees that streams older than a fixed TTL are cleaned from stream storage. [Redis streams](https://redis.io/docs/latest/develop/data-types/streams/) seem like a natural fit for this application. 

A streaming service may eventually need to live in its own server, but at our current scale could be deployed as a part of DCS.

![](https://static-file-service.macro.com/file/aa47ed81-3fe5-46be-b973-3d60316fde13)
