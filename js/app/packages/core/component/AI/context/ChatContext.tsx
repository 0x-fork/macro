import { DEFAULT_MODEL } from '@core/component/AI/constant';
import { useAttachments } from '@core/component/AI/signal/attachment';
import { useTabAttachments } from '@core/component/AI/signal/tabAttachments';
import type {
  Attachment,
  Attachments,
  ChatMessageWithAttachments,
  MessageStream,
  Model,
  UploadQueue,
} from '@core/component/AI/types';
import { useUploadAttachment } from '@core/component/AI/util/uploadToChat';
import { ENABLE_AI_AUTO_TAB_ATTACHMENTS } from '@core/constant/featureFlags';
import { connectionGatewayClient } from '@service-connection/client';
import { subscribe, type Stream } from '@service-connection/stream';
import type { Accessor, ParentProps, Setter } from 'solid-js';
import {
  createContext,
  createEffect,
  createSignal,
  on,
  untrack,
  useContext,
} from 'solid-js';

// ---- Uncreated state (always present) ----

export type ChatInputState = {
  model: Accessor<Model>;
  setModel: (model?: Model) => void;
  isGenerating: Accessor<boolean>;
  setIsGenerating: (generating: boolean) => void;
  attachments: Attachments;
  uploadQueue: UploadQueue;
  // True between sending the HTTP request and first stream chunk arriving
  isAwaitingStream: Accessor<boolean>;
  setIsAwaitingStream: (v: boolean) => void;
};

const ChatInputCtx = createContext<ChatInputState>();

export function ChatInputProvider(
  props: ParentProps & {
    model?: Model;
    isGenerating?: boolean;
    initialAttachments?: Attachment[];
    autoAttach?: boolean;
  }
) {
  const [model, _setModel] = createSignal<Model>(props.model ?? DEFAULT_MODEL);
  const setModel = (m?: Model) => _setModel(m ?? DEFAULT_MODEL);

  const [isGenerating, setIsGenerating] = createSignal<boolean>(
    props.isGenerating ?? false
  );

  const [isAwaitingStream, setIsAwaitingStream] = createSignal(false);

  const attachments = useAttachments(props.initialAttachments);
  const uploadQueue = useUploadAttachment();

  const tabAttachments = useTabAttachments();
  if (ENABLE_AI_AUTO_TAB_ATTACHMENTS && props.autoAttach !== false) {
    createEffect(
      on(tabAttachments, (tabs, p) => {
        for (const prev of p ?? []) {
          if (!tabs.find((t) => t.attachmentId === prev.attachmentId)) {
            attachments.removeAttachment(prev.attachmentId);
          }
        }
        for (const tab of tabs) {
          attachments.addAttachment(tab);
        }
      })
    );
  }

  return (
    <ChatInputCtx.Provider
      value={{
        model,
        setModel,
        isGenerating,
        setIsGenerating,
        attachments,
        uploadQueue,
        isAwaitingStream,
        setIsAwaitingStream,
      }}
    >
      {props.children}
    </ChatInputCtx.Provider>
  );
}

export function useChatInputContext(): ChatInputState {
  const ctx = useContext(ChatInputCtx);
  if (!ctx) {
    throw new Error(
      'useChatInputContext must be used within <ChatInputProvider />'
    );
  }
  return ctx;
}

// ---- Created state (only when chat exists) ----

export type ChatState = {
  chatId: Accessor<string>;
  messages: Accessor<ChatMessageWithAttachments[]>;
  setMessages: Setter<ChatMessageWithAttachments[]>;
  addMessage: (msg: ChatMessageWithAttachments) => void;
  stream: Accessor<MessageStream | undefined>;
  setStream: Setter<MessageStream | undefined>;
  // Connection gateway stream (for stop/cancel)
  chatStream: Accessor<Stream<'chat'> | undefined> | undefined;
};

const ChatCtx = createContext<ChatState>();

export function ChatProvider(
  props: ParentProps & {
    chatId: string;
    messages?: ChatMessageWithAttachments[];
    external?: {
      messages: [
        Accessor<ChatMessageWithAttachments[]>,
        Setter<ChatMessageWithAttachments[]>,
      ];
      stream: [
        Accessor<MessageStream | undefined>,
        Setter<MessageStream | undefined>,
      ];
    };
  }
) {
  let messages: Accessor<ChatMessageWithAttachments[]>;
  let setMessages: Setter<ChatMessageWithAttachments[]>;
  let stream: Accessor<MessageStream | undefined>;
  let setStream: Setter<MessageStream | undefined>;

  if (props.external) {
    [messages, setMessages] = props.external.messages;
    [stream, setStream] = props.external.stream;
  } else {
    const [_messages, _setMessages] = createSignal<
      ChatMessageWithAttachments[]
    >(props.messages ?? []);
    const [_stream, _setStream] = createSignal<MessageStream>();
    messages = _messages;
    setMessages = _setMessages;
    stream = _stream;
    setStream = _setStream;
  }

  const _setMessages = setMessages;
  const addMessage = (msg: ChatMessageWithAttachments) => {
    _setMessages((p) => [...p, msg]);
  };

  // --- connection gateway subscription ---
  const chatId = () => props.chatId;

  // Track entity open/close for the connection gateway
  createEffect(
    on(chatId, (current, prev) => {
      if (prev) {
        connectionGatewayClient.trackEntity({
          entity_type: 'chat',
          entity_id: prev,
          action: 'close',
        });
      }
      if (current) {
        connectionGatewayClient.trackEntity({
          entity_type: 'chat',
          entity_id: current,
          action: 'open',
        });
      }
    })
  );

  // Subscribe to connection gateway streams for this chat
  const chatStream = subscribe(chatId, 'chat');

  // Bridge: connection gateway Stream<"chat"> → MessageStream
  const _setStream = setStream;
  const inputCtx = useContext(ChatInputCtx);

  createEffect(() => {
    const cgStream = chatStream();
    if (!cgStream) return;

    // Dedup: stream_id matches chat message id — if already in messages, skip
    const streamId = cgStream.id()?.stream_id;
    if (streamId && untrack(() => messages()?.some((m) => m.id === streamId))) {
      return;
    }

    inputCtx?.setIsAwaitingStream(false);

    const bridged: MessageStream = {
      data: cgStream.data,
      isDone: cgStream.isDone,
      isErr: () => false,
      err: () => undefined,
      close: () => {},
      get request() {
        return { stream_id: cgStream.id()?.stream_id } as any;
      },
    };
    _setStream(bridged);
  });

  return (
    <ChatCtx.Provider
      value={{
        chatId,
        messages,
        setMessages,
        addMessage,
        stream,
        setStream,
        chatStream,
      }}
    >
      {props.children}
    </ChatCtx.Provider>
  );
}

export function useChatContext(): ChatState {
  const ctx = useContext(ChatCtx);
  if (!ctx) {
    throw new Error('useChatContext must be used within <ChatProvider />');
  }
  return ctx;
}

export function useChatContextOptional(): ChatState | undefined {
  return useContext(ChatCtx);
}
