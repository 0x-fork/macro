import type { ChatStream } from '@service-cognition/generated/schemas';
import type { Accessor, Setter } from 'solid-js';
import { createEffect, createSignal, on } from 'solid-js';
import { createConnectionWebsocketEffect } from './websocket';

// entities that support streaming
export type StreamType = {
  chat: ChatStream;
};

export type StreamId = {
  entity_type: keyof StreamType;
  entity_id: string;
  // matches chat message id
  stream_id: string;
};

export type StreamItem<K extends keyof StreamType> = {
  id: StreamId;
  payload: StreamType[K];
};

// naked id indicates stream over
type End = StreamId;

type StreamEvent<K extends keyof StreamType> = End | StreamItem<K>;

function isItem<K extends keyof StreamType>(
  event: StreamEvent<K>
): event is StreamItem<K> {
  return 'payload' in event;
}

export interface Stream<K extends keyof StreamType> {
  id: Accessor<StreamId | undefined>;
  data: Accessor<StreamType[K][]>;
  isDone: Accessor<boolean>;
}

type StreamController<K extends keyof StreamType> = {
  stream: Stream<K>;
  setData: Setter<StreamType[K][]>;
  setDone: () => void;
  id: StreamId;
};

function newStream<K extends keyof StreamType>(
  id: StreamId
): StreamController<K> {
  const [data, setData] = createSignal<StreamType[K][]>([]);
  const [isDone, setIsDone] = createSignal(false);

  return {
    stream: {
      id: () => id,
      data,
      isDone,
    },
    id,
    setData,
    setDone: () => setIsDone(true),
  };
}

/**
 Subscribe to all streams going to an entity.
 When a stream ends the accessor will not change until a new stream starts.
 `undefined` in only returned before any items have been returned by any stream

 To subscribe, an entity must be properly tracked with connection_gateway ie: track(entity_id, "open")
 ^ this is done by default for all block
 */
//This falls over for entities where multiple simultaneous streams are needed
export function subscribe<K extends keyof StreamType>(
  entity_id: Accessor<string | undefined>,
  _: K
): Accessor<Stream<K> | undefined> {
  const [controller, setController] = createSignal<StreamController<K>>();

  createEffect(
    on(entity_id, () => {
      setController(undefined);
    })
  );

  createConnectionWebsocketEffect((data) => {
    if (data.type !== 'stream') {
      return;
    }
    const eid = entity_id();
    if (!eid) return;
    let event: StreamEvent<K>;
    try {
      event = JSON.parse(data.data);
    } catch {
      console.error('unexpected stream message', data.data);
      return;
    }
    if (isItem(event)) {
      if (event.id.entity_id !== eid) return;
      const current = controller();
      if (!current || current.id.stream_id !== event.id.stream_id) {
        const ctrl = newStream<K>(event.id);
        ctrl.setData([event.payload]);
        setController(ctrl);
      } else {
        current.setData((prev) => [...prev, event.payload]);
      }
    } else if (event.entity_id === eid) {
      const current = controller();
      if (current && current.id.stream_id === event.stream_id) {
        current.setDone();
      }
    }
  });

  return () => controller()?.stream;
}
