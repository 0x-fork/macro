import type { Model } from '@core/component/AI/types';
import { isPaymentError } from '@core/util/handlePaymentError';
import { cognitionApiServiceClient } from '@service-cognition/client';
import type { ToolGrantDecision } from '@service-cognition/generated/schemas';
import type { ChatMessageStream } from '@service-connection/stream';
import { subscribe } from '@service-connection/stream';
import { useMutation } from '@tanstack/solid-query';

/**
 * Resume a chat that suspended on a tool-permission request by submitting the
 * user's grant/deny decisions.
 *
 * Permission grants are stateless: there is no live channel or server-held
 * grant. The decision is delivered through the normal chat HTTP entry point
 * (`/stream/chat/message`) with `tool_grants`. The backend materializes the
 * decisions into the persisted message chain (executing granted tools, inserting
 * a placeholder result for denied ones) and streams the continued turn back.
 */
export type ResumeWithGrantsInput = {
  chatId: string;
  model: Model;
  decisions: ToolGrantDecision[];
};

export type ResumeWithGrantsResult =
  | { stream: ChatMessageStream; chatId: string }
  | { error: true; paymentError?: boolean };

async function resumeWithGrants({
  chatId,
  model,
  decisions,
}: ResumeWithGrantsInput): Promise<ResumeWithGrantsResult> {
  const response = await cognitionApiServiceClient.sendStreamChatMessage({
    // The turn is resumed from the pending tool calls in the chain, so no new
    // user content is sent.
    content: '',
    model,
    chat_id: chatId,
    tool_grants: decisions,
  });

  if (isPaymentError(response)) {
    return { error: true, paymentError: true };
  }
  if (response.isErr()) {
    return { error: true };
  }

  const { stream_id, chat_id } = response.value;
  const stream = subscribe('chat', chat_id, stream_id);
  if (!stream) {
    return { error: true };
  }

  return { stream, chatId: chat_id };
}

/**
 * TanStack mutation for granting or denying pending tool calls. All network
 * traffic goes through TanStack Query — components never call the service client
 * directly.
 */
export function useResumeWithToolGrantsMutation() {
  return useMutation(() => ({
    mutationFn: (input: ResumeWithGrantsInput) => resumeWithGrants(input),
  }));
}
