import type { ChatMessageWithAttachments } from '@core/component/AI/types';
import type { Entity } from '@service-cognition/generated/schemas/entity';
import { type Accessor, createMemo } from 'solid-js';
import { match, P } from 'ts-pattern';
import { createMessageChain, type MessageChainState } from './messageChain';

// `messageChain.ts` is an internal detail of the state machine — only this
// module consumes it. Re-export the public surface UI consumers need so they
// import all chat-state from `chatState`, never from `messageChain`.
export { isSuspended, READY } from './messageChain';
export type { MessageChainState, UnresolvedCall } from './messageChain';

// --- Base phase (the FSM state) ---
//
// The state machine is defined over these three BASE states only. Transitions
// never carry or compute the message-chain (suspended/ready) state — that is
// derived separately from `messages` and attached to the exposed `idle` phase
// by `createChatPhase`.

export type BasePhase =
  | { type: 'idle' }
  | { type: 'sending'; optimisticMessageId: string }
  | { type: 'streaming' };

/** The initial base phase. */
export const initialBasePhase: BasePhase = { type: 'idle' };

// --- Exposed phase ---
//
// What consumers read. The `idle` arm OWNS the derived `messageChain`; the
// other arms are the base states unchanged. Only `idle` with a `ready` chain
// may send (see `canSend`).

export type ChatPhase =
  | { type: 'idle'; messageChain: MessageChainState }
  | { type: 'sending'; optimisticMessageId: string }
  | { type: 'streaming' };

/**
 * The single send precondition: idle ∧ ready. Lives here so there is one
 * authority on whether a new message may be sent.
 */
export const canSend = (phase: ChatPhase): boolean =>
  phase.type === 'idle' && phase.messageChain.type === 'ready';

/**
 * Assemble the exposed phase from the FSM base state and the message list. The
 * derived, memoized message-chain (see [`createMessageChain`]) is attached to
 * the `idle` arm only — one owner, no competing accessors. The chain derives
 * from the COMMITTED `messages` (by the time we are idle, `stream_done` has
 * upserted the finished message).
 */
export function createChatPhase(
  baseState: Accessor<BasePhase>,
  messages: Accessor<ChatMessageWithAttachments[]>
): Accessor<ChatPhase> {
  const messageChain = createMessageChain(messages);
  return createMemo<ChatPhase>(() => {
    const base = baseState();
    return base.type === 'idle'
      ? { type: 'idle', messageChain: messageChain() }
      : base;
  });
}

// --- Events ---

export type ChatEvent =
  | {
      type: 'send_started';
      optimisticMessage: ChatMessageWithAttachments;
    }
  | { type: 'send_failed'; paymentError?: boolean }
  | { type: 'stream_connected' }
  | {
      type: 'stream_user_message';
      messageId: string;
      content: string;
      attachments: Entity[];
    }
  | {
      type: 'stream_done';
      message: ChatMessageWithAttachments | undefined;
    }
  | {
      type: 'stream_error';
      streamError: string | undefined;
    };

export type SideEffect =
  | { type: 'toast'; message: string }
  | { type: 'show_paywall' };

// --- Transition result ---

type TransitionResult = {
  phase: BasePhase;
  messages?: (
    prev: ChatMessageWithAttachments[]
  ) => ChatMessageWithAttachments[];
  effects: SideEffect[];
};

const rejected = (phase: BasePhase, event: string): TransitionResult => {
  console.warn(`chat transition: ${event} from ${phase.type}`);
  return { phase, effects: [] };
};

/**
 * The FSM transition, defined over the BASE states only. Suspension (the
 * message-chain state) is derived separately and is not part of this machine —
 * the caller gates sending on it via `canSend(phase)`.
 */
export function transition(
  phase: BasePhase,
  event: ChatEvent
): TransitionResult {
  return (
    match([phase, event] as const)
      // A new message may only start from idle. The suspended/ready gate lives
      // in `canSend` (read by the caller before dispatching), so the machine
      // only needs the phase gate here.
      .with([{ type: 'idle' }, { type: 'send_started' }], ([, e]) => ({
        phase: {
          type: 'sending' as const,
          optimisticMessageId: e.optimisticMessage.id,
        },
        messages: (prev: ChatMessageWithAttachments[]) => [
          ...prev,
          e.optimisticMessage,
        ],
        effects: [],
      }))

      .with([{ type: 'sending' }, { type: 'send_failed' }], ([, e]) => ({
        phase: { type: 'idle' as const },
        effects: e.paymentError
          ? ([{ type: 'show_paywall' }] as SideEffect[])
          : [],
      }))

      .with(
        [{ type: P.union('idle', 'sending') }, { type: 'stream_connected' }],
        () => ({
          phase: { type: 'streaming' as const },
          effects: [],
        })
      )

      .with(
        [
          { type: P.union('sending', 'streaming') },
          { type: 'stream_user_message' },
        ],
        ([, e]) => {
          return {
            phase: { type: 'streaming' as const },
            messages: (prev: ChatMessageWithAttachments[]) => {
              if (
                prev.find((m) => m.role === 'user' && m.content === e.content)
              )
                return prev;
              return [
                ...prev,
                {
                  id: e.messageId,
                  content: e.content,
                  role: 'user' as const,
                  attachments: e.attachments,
                },
              ];
            },
            effects: [],
          };
        }
      )

      // stream_done returns to idle and upserts the completed message into the
      // chain BY id (replace if present, else append). Suspension is then
      // re-derived from the updated chain — a continuation that emitted another
      // gated tool call re-derives as suspended automatically.
      .with([{ type: 'streaming' }, { type: 'stream_done' }], ([, e]) => ({
        phase: { type: 'idle' as const },
        messages: e.message
          ? (prev: ChatMessageWithAttachments[]) => {
              const idx = prev.findIndex((m) => m.id === e.message!.id);
              if (idx === -1) return [...prev, e.message!];
              const next = prev.slice();
              next[idx] = e.message!;
              return next;
            }
          : undefined,
        effects: [],
      }))

      .with(
        [{ type: P.union('streaming', 'sending') }, { type: 'stream_error' }],
        ([, e]) => ({
          phase: { type: 'idle' as const },
          effects: [
            {
              type: 'toast' as const,
              message:
                e.streamError === 'model_context_overflow'
                  ? 'Too much context. Remove attachments or start a new chat'
                  : 'Failed to respond to message',
            },
          ],
        })
      )
      .otherwise(([p, e]) => rejected(p, e.type))
  );
}
