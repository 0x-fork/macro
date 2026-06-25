import { displayResultsInstructions } from '@app/component/dynamic-ui/toolSchema';
import { analytics } from '@app/lib/analytics';
import { DEFAULT_MODEL } from '@core/component/AI/constant';
import { useAdditionalInstructions } from '@core/component/AI/constant/prompts';
import type { Attachment, Model, ToolSet } from '@core/component/AI/types';
import { isPaymentError } from '@core/util/handlePaymentError';

import { cognitionApiServiceClient } from '@service-cognition/client';
import type { AssistantMessagePart } from '@service-cognition/generated/schemas/assistantMessagePart';
import type { ResolveAction } from '@service-cognition/generated/schemas/resolveAction';
import type { ChatMessageStream } from '@service-connection/stream';
import { subscribe } from '@service-connection/stream';

export type ChatSendInput = {
  content: string;
  model: Model;
  attachments: Attachment[];
  toolset: ToolSet;
  metaKey?: boolean;
};

type SendChatMessageResult =
  | { stream: ChatMessageStream; chat_id: string }
  | { error: true; paymentError?: boolean };

export function useSendChatMessage() {
  const additionalInstructions = useAdditionalInstructions();

  return async function sendChatMessage({
    content,
    model,
    chatId,
    attachments,
    toolset,
  }: ChatSendInput & { chatId?: string }): Promise<SendChatMessageResult> {
    // Append the dynamic-UI (displayResults) JSON schema so the model knows the
    // shape of the tool's `any` `view` argument.
    const base = additionalInstructions();
    const dashboard = displayResultsInstructions();
    const merged = base ? `${base}\n\n${dashboard}` : dashboard;

    const response = await cognitionApiServiceClient.sendStreamChatMessage({
      content,
      model: model ?? DEFAULT_MODEL,
      chat_id: chatId,
      attachments: attachments.length > 0 ? attachments : undefined,
      toolset,
      additional_instructions: merged,
    });

    if (isPaymentError(response)) {
      return { error: true, paymentError: true };
    }
    if (response.isErr()) {
      return { error: true };
    }

    const { stream_id, chat_id } = response.value;

    const connectionStream = subscribe('chat', chat_id, stream_id);
    if (!connectionStream) {
      return { error: true };
    }

    analytics.track('ai_message_sent', {
      model: model ?? DEFAULT_MODEL,
      attachmentCount: attachments.length,
    });

    return {
      chat_id,
      stream: {
        data: connectionStream.data,
        isDone: connectionStream.isDone,
        id: () => ({
          entity_id: chat_id,
          stream_id: stream_id,
          entity_type: 'chat',
        }),
      },
    };
  };
}

/** Input for resolving a suspended chat's pending tool calls. */
export type ResolveChatInput = {
  chatId: string;
  model: Model;
  toolset: ToolSet;
  action: ResolveAction;
};

export type ResolveChatResult =
  | {
      resumed: true;
      stream: ChatMessageStream;
      chat_id: string;
      /** The suspended message's id — the stream rebuilds this message. */
      messageId: string;
      /** The resolved parts (tool call(s) + their results). */
      parts: AssistantMessagePart[];
    }
  | {
      resumed: false;
      /** The suspended message's id to patch in place. */
      messageId: string;
      /** The resolved parts to replace the suspended message's parts with. */
      parts: AssistantMessagePart[];
    }
  | { error: true };

/**
 * Resolve a suspended chat's pending tool calls (accept / deny a batch, or
 * cancel all). The suspended message and its resumption are ONE message: the
 * response always carries that message's id (`message_id`) and its resolved
 * `parts`. On a resume (chain became ready and not a cancel) the response also
 * carries a stream — whose id equals the message id — that rebuilds the message
 * live; the caller subscribes to it exactly like a normal send. A partial
 * resolve / cancel returns `{ resumed: false }` with the parts to patch in.
 */
export function useResolveChatToolCalls() {
  return async function resolveChatToolCalls({
    chatId,
    model,
    toolset,
    action,
  }: ResolveChatInput): Promise<ResolveChatResult> {
    const response = await cognitionApiServiceClient.resolveChatToolCalls({
      chat_id: chatId,
      model: model ?? DEFAULT_MODEL,
      toolset,
      ...action,
    });

    if (response.isErr()) {
      return { error: true };
    }

    const { stream_id, chat_id, resumed, message_id, parts } = response.value;

    if (!resumed) {
      return { resumed: false, messageId: message_id, parts };
    }

    const connectionStream = subscribe('chat', chat_id, stream_id);
    if (!connectionStream) {
      return { error: true };
    }

    return {
      resumed: true,
      chat_id,
      messageId: message_id,
      parts,
      stream: {
        data: connectionStream.data,
        isDone: connectionStream.isDone,
        id: () => ({
          entity_id: chat_id,
          stream_id: stream_id,
          entity_type: 'chat',
        }),
      },
    };
  };
}
