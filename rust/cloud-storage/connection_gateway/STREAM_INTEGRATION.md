# Stream Integration Plan: connection_gateway + stream crate

## Overview

Integrate the `stream` crate (durable Redis Streams) with `connection_gateway` to support chat streaming where:
- Streams persist independently of WebSocket connections
- All users viewing a chat consume the same stream
- Users joining mid-stream get replay from beginning
- Streams can exist for any entity type (chat, document, etc.)

**Scope**: Consumer side only (connection_gateway). Producer integration (DCS) is separate work.

## Architecture

```
AI Service (DCS)                          Users viewing Chat X
      |                                         |    |    |
      | append()                                |    |    |
      v                                         v    v    v
+-------------+    stream_from_beginning()   +-----------------+
| Redis       |<-----------------------------| Connection GW   |
| Streams     |    (per-entity subscription) | (EntityStream   |
|             |                              |  Manager)       |
+-------------+                              +-----------------+
```

Entity opens:
  - stream_exists ? stream_from_begining : noop

Stream Starts: 
  - if entity is open
  - for all connetions to entity 
    - stream_from_start

Q: how does connection_gateway know when a new stream starts?
A: redis pub/sub thread to listen for new keyspaces. 
^ StreamService::notify creates returns a broadcast channel to that notifies on new keyspace

Q: What happens when a stream starts
A: 
- All active connections get sent the same stream
- If a connection becomes inactive it's removed from the stream consumer group
- A record of the active stream is kept so people can join late

Q: What happens when a user joins late?
  
Q: This means that there could be a thread per user to consume the stream. Can this be
done with fewer threads?


Q: What is the synchronization model

A stream is a view into the creation of a message. When a stream completes it becomes a message.
It is important that the message exists only as a stream _or_ a message. It would be wrong to see a stream and a message.
There needs to be a strong guarantee that a user will see either a message or a stream.

> In an ideal world a stream and message may be the same type. Where fetching a messages is fetching the 
> completed datastream. In theory this sounds simplifying, but doesn't solve the main problem if an 
> external database (redis streams) is used to support high bandwidth streaming.

Synchronization could could be done with a frontend choice to invalidate a stream if the message the
stream represents is already present. This feels slopy and leads to uneccessary network traffic and 
per-application handling on the frontend.

A backend solution is harder to reason about. How do I guarantee that the client hasn't fetched the 
completed stream before sending the active stream?

On the backend the model is
  1. request
  2. create_stream
  3. wait for stream to complete
  4. save the completed message to the database
  
From the frontend this looks like
  1. Load chat 
  2. Send http request to DCS
  3. Get lots of ws messages (stream) from connection_gateway
  
On the frontend it could also look like this:
  1. Load chat
  2. Get lots of ws messages (an already in-progress stream) from connection_gateway
^ This last case is the case where the invariant of either message or stream must be upheld

There must also never be a case where a user gets neither the stream nor the message.

The most obvious way to resolve this is to make no guarantees to the frontend about stream delivery
and expect that the frontend correctly handle duplicate data. To avoid missed data, a stream should
only be marked as completed _after_ the message has been written to the database. This needs to be 
upheld by the producer.

A: Synchronization model

Frontend
  - Saves active stream id + offset
  - frontend ignores streams for messages fetched on 1st load
  
Backend
  - Streams are completed / cleaned up _after_ message written to db
