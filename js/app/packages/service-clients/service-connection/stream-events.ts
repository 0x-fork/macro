import type { EntityData } from '@entity';
import type { Accessor } from 'solid-js';
import { createStore } from 'solid-js/store';
import { z } from 'zod';
import type { StreamEvent } from './generated/schemas';
import { isStreamEntity } from './stream';
import { createConnectionWebsocketEffect, ws } from './websocket';
import { parseWebsocketPayload } from './websocketPayload';

const [streamState, setStreamState] = createStore<Record<string, StreamEvent>>(
  {}
);
const subscribed = new Set<string>();

const streamEventSchema = z
  .object({
    entity_id: z.string(),
    entity_type: z.enum([
      'user',
      'chat',
      'channel',
      'document',
      'project',
      'email_thread',
      'team',
      'call',
      'static_file',
    ]),
    stream_id: z.string(),
    type: z.enum(['created', 'closed']),
  })
  .passthrough() satisfies z.ZodType<StreamEvent>;

createConnectionWebsocketEffect((data) => {
  if (data.type !== 'stream_event') return;
  const event = parseWebsocketPayload(data.type, data.data, streamEventSchema);
  if (!event) return;

  setStreamState(event.entity_id, event);
});

export function getStreamState(
  entity_id: string
): Accessor<StreamEvent | undefined> {
  return () => streamState[entity_id];
}

export function subscribeToStreamState(
  entity_id: string,
  entity_type: EntityData['type']
) {
  if (!isStreamEntity(entity_type) || subscribed.has(entity_id)) return;
  subscribed.add(entity_id);
  ws.send({
    type: 'stream_events',
    entity_id,
    entity_type: entity_type,
  });
}
