/**
 * Generated-style companion type for the `codingAgentEvent` variant of
 * `AssistantMessagePart` (serde tag = "type", camelCase). Hand-authored until
 * the OpenAPI/orval generation picks it up from the Rust `ToSchema`.
 */
import type { CodingEvent } from './codingEvent';

/**
 * A streamed event from a delegated coding agent running in a sandbox. The
 * `id` groups all events of one coding session; `event` is the ACP-mapped
 * payload.
 */
export interface AssistantMessagePartCodingAgentEvent {
  type: 'codingAgentEvent';
  id: string;
  event: CodingEvent;
}
