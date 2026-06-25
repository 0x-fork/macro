import type { ChatMessageWithAttachments } from '@core/component/AI/types';
import { asChatMessage } from '@core/component/AI/util/message';
import { bufferedStream } from '@core/component/AI/util/stream';
import { toast } from '@core/component/Toast/Toast';
import type { ChatMessageStream } from '@service-connection/stream';
import { getEntityStreams } from '@service-connection/stream';
import type { Accessor, Owner, Setter } from 'solid-js';
import {
  createEffect,
  createMemo,
  createSignal,
  getOwner,
  on,
  runWithOwner,
  untrack,
} from 'solid-js';
import { match } from 'ts-pattern';
import {
  type BasePhase,
  type ChatEvent,
  type ChatPhase,
  createChatPhase,
  initialBasePhase,
  type SideEffect,
  transition,
} from './chatState';

type StreamConnectedEvent = {
  type: 'stream_connected';
  stream: ChatMessageStream;
  owner?: Owner | null;
};

type ControllerEvent =
  | Exclude<ChatEvent, { type: 'stream_connected' }>
  | StreamConnectedEvent;

export type ChatController = {
  chatId: Accessor<string>;
  /**
   * The exposed phase. Its `idle` arm OWNS the derived `messageChain`
   * (suspended/ready) state — the single source consumers read for the
   * permission dialog and the send gate (`canSend`).
   */
  phase: Accessor<ChatPhase>;
  /** The persisted message chain (source of truth for what is saved). */
  messages: Accessor<ChatMessageWithAttachments[]>;
  setMessages: Setter<ChatMessageWithAttachments[]>;
  /**
   * The render chain: `messages` with the in-flight streaming message merged in
   * BY id (replace if its id is already present, else append). The UI renders
   * from THIS so a live continuation updates its message in place (keeping its
   * slot — a resume merges into the suspended bubble), and a brand-new turn's
   * streaming message appends at the end. There is no separate trailing
   * "generating" bubble.
   */
  effectiveMessages: Accessor<ChatMessageWithAttachments[]>;
  stream: Accessor<ChatMessageStream | undefined>;
  isGenerating: Accessor<boolean>;
  isWaiting: Accessor<boolean>;

  dispatch: (event: ControllerEvent) => void;
  /** Escape hatch for debug components that set stream directly */
  setStream: Setter<ChatMessageStream | undefined>;
};

export type ChatControllerOptions = {
  onShowPaywall?: () => void;
};

export function createChatController(
  chatId: string,
  initialMessages: ChatMessageWithAttachments[],
  options?: ChatControllerOptions
): ChatController {
  // The FSM base state. The exposed `phase` (below) attaches the derived
  // message-chain state to its `idle` arm.
  const [baseState, setBaseState] = createSignal<BasePhase>(initialBasePhase);
  const [messages, setMessages] =
    createSignal<ChatMessageWithAttachments[]>(initialMessages);
  const [stream, setStream] = createSignal<ChatMessageStream>();

  // THE exposed phase: base state + the derived, memoized message-chain owned by
  // `idle`. The chain derives from the COMMITTED `messages` (when idle, the
  // finished message has already been upserted by `stream_done`).
  const phase = createChatPhase(baseState, messages);

  // The in-flight stream rendered as a message (by its chunks' `message_id`),
  // while it is still streaming. `undefined` once done or with no renderable
  // content yet (so we never merge an empty assistant bubble into the chain —
  // the spinner covers that gap).
  const streamingMessage = createMemo<ChatMessageWithAttachments | undefined>(
    () => {
      const s = stream();
      if (!s || s.isDone()) return undefined;
      const message = asChatMessage(s.data());
      if (!message) return undefined;
      const content = message.content;
      const isEmpty =
        (typeof content === 'string' || Array.isArray(content)) &&
        content.length === 0;
      return isEmpty ? undefined : message;
    }
  );

  // The effective chain used for RENDERING: persisted `messages` with the
  // in-flight streaming message merged in BY id (replace if an id match exists,
  // else append). This keeps a live continuation in its slot (a resume merges
  // into the suspended bubble) and appends a brand-new turn's streaming message
  // at the end — there is no separate trailing "generating" bubble. The
  // message-chain (suspended/ready) state, by contrast, derives from committed
  // `messages` via the exposed `phase`.
  const effectiveMessages = createMemo<ChatMessageWithAttachments[]>(() => {
    const base = messages();
    const live = streamingMessage();
    if (!live) return base;
    const idx = base.findIndex((m) => m.id === live.id);
    if (idx === -1) return [...base, live];
    const next = base.slice();
    next[idx] = live;
    return next;
  });

  function executeEffects(effects: SideEffect[]) {
    for (const effect of effects) {
      match(effect)
        .with({ type: 'toast' }, (e) => toast.failure(e.message))
        .with({ type: 'show_paywall' }, () => options?.onShowPaywall?.())
        .exhaustive();
    }
  }

  function watchStream(newStream: ChatMessageStream) {
    // Watch stream data for user messages and errors
    createEffect(
      on(
        () => newStream.data(),
        (data) => {
          const latest = data.at(-1);
          if (!latest) return;

          match(latest)
            .with({ type: 'error' }, (r) => {
              const streamError =
                'stream_error' in r ? r.stream_error : undefined;
              dispatch({
                type: 'stream_error',
                streamError: streamError as string | undefined,
              });
            })
            .with({ type: 'chat_user_message' }, (r) => {
              dispatch({
                type: 'stream_user_message',
                messageId: r.message_id,
                content: r.content,
                attachments: r.attachments,
              });
            })
            .otherwise(() => {});
        }
      )
    );

    // Watch stream completion. The completed message upserts into `messages` by
    // id (see `stream_done`), so a resumed continuation merges into the SAME
    // bubble and the derived message-chain updates from the final chain.
    createEffect(() => {
      if (!newStream.isDone()) return;
      const message = asChatMessage(newStream.data());
      dispatch({ type: 'stream_done', message });
    });
  }

  function dispatch(event: ControllerEvent) {
    // Handle stream attachment through the state transition
    if (event.type === 'stream_connected' && 'stream' in event) {
      const { owner = getOwner() } = event;
      let newStream: ChatMessageStream;
      if (owner) {
        const ownedStream = runWithOwner(owner, () =>
          bufferedStream(event.stream)
        );
        if (!ownedStream) return;
        newStream = ownedStream;
      } else {
        newStream = bufferedStream(event.stream);
      }
      setStream(newStream);

      const result = transition(untrack(baseState), {
        type: 'stream_connected',
      });
      setBaseState(result.phase);
      executeEffects(result.effects);

      if (owner) {
        runWithOwner(owner, () => watchStream(newStream));
      } else {
        watchStream(newStream);
      }
      return;
    }

    const result = transition(untrack(baseState), event);
    setBaseState(result.phase);
    if (result.messages) {
      setMessages(result.messages);
    }
    // Clear stream on transition to idle
    if (result.phase.type === 'idle' && untrack(stream)) {
      setStream(undefined);
    }
    executeEffects(result.effects);
  }

  // Reconnect active streams on page refresh / chat switch. Streams are keyed
  // by `stream_id`; a resumed stream uses a FRESH stream_id (its `message_id`
  // equals the suspended message's id, but the ids are decoupled), so it never
  // collides with the suspended message already in the chain — reconnect/replay
  // works and the continuation merges into that message by `message_id` via the
  // streaming-message merge above + `stream_done` upsert.
  createEffect(() => {
    const activeStreams = getEntityStreams('chat', chatId)();
    const currentStream = untrack(stream);

    for (const s of activeStreams) {
      const sid = s.id()?.stream_id;
      if (!sid) {
        console.warn('reject chat stream: no id');
        continue;
      }
      if (currentStream?.isDone() && currentStream?.id()?.stream_id === sid) {
        console.warn('reject chat stream: duplicate stream');
        continue;
      }
      // Already attached to this exact (live) stream — don't re-attach.
      if (currentStream && currentStream.id()?.stream_id === sid) {
        continue;
      }
      // A finished stream whose message is already in the chain is a replay of
      // a completed turn — skip it (re-attaching would briefly flip to
      // streaming then immediately complete). A resumed stream uses a fresh
      // stream_id and is live, so it is never skipped here even though its
      // message id matches the suspended message.
      const isReplayOfFinishedMessage =
        s.isDone() && untrack(() => messages().some((m) => m.id === sid));
      if (isReplayOfFinishedMessage) {
        console.warn('reject chat stream: already has message');
        continue;
      }

      // Refresh-mid-resume: a live resumed stream rebuilds the (still
      // persisted, still suspended) message it continues, keyed by the stream's
      // chunk `message_id`. No need to strip anything — `effectiveMessages`
      // merges the live stream into that existing message BY id, so it renders
      // in place (no duplicate bubble), and `stream_done` upserts it back into
      // the persisted chain in its original slot.
      dispatch({ type: 'stream_connected', stream: s });
      break;
    }
  });

  return {
    chatId: () => chatId,
    phase,
    messages,
    setMessages,
    effectiveMessages,
    stream,
    isGenerating: () => baseState().type === 'streaming',
    isWaiting: () => baseState().type === 'sending',

    dispatch,
    setStream,
  };
}
