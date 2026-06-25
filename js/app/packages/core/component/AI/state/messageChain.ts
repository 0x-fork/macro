import type { ChatMessageWithAttachments } from '@core/component/AI/types';
import type { AssistantMessagePart } from '@service-cognition/generated/schemas/assistantMessagePart';
import { type Accessor, createMemo } from 'solid-js';

// --- Message chain state ---
//
// The suspended/ready state of a chat is **derived** from the message chain —
// it is NOT stored anywhere and NOT mutated by events. A chain whose last
// assistant message contains a tool call with no matching result (a "dangling"
// call) is `Suspended`; otherwise `Ready`. It is recomputed reactively from
// `messages` (including on mount from the persisted chain), so a refresh or
// another device reconstructs the permission dialog purely from the saved
// messages — no "I just suspended" event needed.
//
// A `Suspended` chain has one or more tool calls awaiting the user's permission
// (accept / deny / cancel) — rendered via the Anthropic-style dialog that
// replaces the input box.

/** A tool call awaiting permission resolution (referenced; already in-chain). */
export type UnresolvedCall = {
  id: string;
  name: string;
};

export type MessageChainState =
  | { type: 'ready' }
  | { type: 'suspended'; unresolved: UnresolvedCall[] };

export const READY: MessageChainState = { type: 'ready' };

/** Whether the chain is suspended (awaiting permission resolution). */
export const isSuspended = (s: MessageChainState): boolean =>
  s.type === 'suspended';

/**
 * Derive the chain state from an assistant message's parts — the frontend
 * mirror of the backend `derive_state`. A `toolCall` / `mcpToolCall` with no
 * later matching `toolCallResponseJson` / `toolCallErr` (by id) is dangling;
 * any dangling call ⇒ `Suspended` over those calls (in chain order), otherwise
 * `Ready`. A message that is plain text (no parts) is always `Ready`.
 */
export const deriveMessageChain = (
  parts: AssistantMessagePart[] | undefined
): MessageChainState => {
  if (!parts) return READY;

  const resolved = new Set<string>();
  for (const part of parts) {
    if (part.type === 'toolCallResponseJson' || part.type === 'toolCallErr') {
      resolved.add(part.id);
    }
  }

  const unresolved: UnresolvedCall[] = [];
  for (const part of parts) {
    if (
      (part.type === 'toolCall' || part.type === 'mcpToolCall') &&
      !resolved.has(part.id)
    ) {
      unresolved.push({ id: part.id, name: part.name });
    }
  }

  return unresolved.length === 0 ? READY : { type: 'suspended', unresolved };
};

/**
 * Derive the chain state from a (possibly text) chat message. Text messages
 * (string content) and missing messages are `Ready`.
 */
export const deriveMessageChainFromMessage = (
  message: ChatMessageWithAttachments | undefined
): MessageChainState => {
  if (!message) return READY;
  const content = message.content;
  if (typeof content === 'string') return READY;
  return deriveMessageChain(content);
};

/**
 * Derive the chain state from a full message list — the single source of truth
 * for suspension. Only the last assistant message can be suspended (a dangling
 * tool call is always the tail of the turn that emitted it), so we look at the
 * last assistant message in the chain.
 */
export const deriveMessageChainFromMessages = (
  messages: ChatMessageWithAttachments[]
): MessageChainState => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      return deriveMessageChainFromMessage(messages[i]);
    }
  }
  return READY;
};

/**
 * THE memoized message-chain signal: derives [`MessageChainState`] reactively
 * from the committed message list. One owner — the controller builds this once
 * and the exposed `idle` phase carries its value (see `createChatPhase`).
 */
export function createMessageChain(
  messages: Accessor<ChatMessageWithAttachments[]>
): Accessor<MessageChainState> {
  return createMemo(() => deriveMessageChainFromMessages(messages()));
}
