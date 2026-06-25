import type { ChatMessageWithAttachments } from '@core/component/AI/types';
import type { AssistantMessagePart } from '@service-cognition/generated/schemas/assistantMessagePart';
import { describe, expect, it } from 'vitest';
import {
  type BasePhase,
  type ChatPhase,
  canSend,
  transition,
} from './chatState';
import { deriveMessageChainFromMessages, READY } from './messageChain';

const callPart = (id: string, name = 'T'): AssistantMessagePart => ({
  type: 'toolCall',
  id,
  name,
  json: {},
});
const respPart = (id: string, name = 'T'): AssistantMessagePart => ({
  type: 'toolCallResponseJson',
  id,
  name,
  json: { ok: true },
});
const textPart = (text: string): AssistantMessagePart => ({
  type: 'text',
  text,
});

const userMsg = (id: string, content = 'hi'): ChatMessageWithAttachments => ({
  id,
  content,
  role: 'user',
  attachments: [],
});

const assistantMsg = (
  id: string,
  content: string | AssistantMessagePart[]
): ChatMessageWithAttachments => ({
  id,
  content,
  role: 'assistant',
  attachments: [],
});

// --- transition (FSM over BASE states; no message-chain) ---

const idle: BasePhase = { type: 'idle' };
const streaming: BasePhase = { type: 'streaming' };

describe('transition', () => {
  it('idle + send_started -> sending (and appends optimistic message)', () => {
    const res = transition(idle, {
      type: 'send_started',
      optimisticMessage: userMsg('opt-1'),
    });
    expect(res.phase.type).toBe('sending');
    const next = res.messages?.([]);
    expect(next?.map((m) => m.id)).toEqual(['opt-1']);
  });

  it('sending + send_failed -> idle', () => {
    const res = transition(
      { type: 'sending', optimisticMessageId: 'opt-1' },
      { type: 'send_failed' }
    );
    expect(res.phase.type).toBe('idle');
  });

  it('idle + stream_connected -> streaming', () => {
    const res = transition(idle, { type: 'stream_connected' });
    expect(res.phase.type).toBe('streaming');
  });

  it('stream_done -> idle and appends a new message by id', () => {
    const res = transition(streaming, {
      type: 'stream_done',
      message: assistantMsg('m1', [textPart('hi')]),
    });
    expect(res.phase.type).toBe('idle');
    const next = res.messages?.([userMsg('u1')]);
    expect(next?.map((m) => m.id)).toEqual(['u1', 'm1']);
  });

  it('stream_done REPLACES an existing message by id (resume merges into same bubble)', () => {
    const prev = [userMsg('u1'), assistantMsg('m1', [callPart('x', 'Delete')])];
    const resolved = assistantMsg('m1', [
      callPart('x', 'Delete'),
      respPart('x', 'Delete'),
      textPart('done'),
    ]);
    const res = transition(streaming, {
      type: 'stream_done',
      message: resolved,
    });
    const next = res.messages?.(prev);
    expect(next?.map((m) => m.id)).toEqual(['u1', 'm1']);
    expect(next && next[1].content).toEqual(resolved.content);
    expect(next && deriveMessageChainFromMessages(next)).toEqual(READY);
  });

  it('stream_error returns to idle with a toast', () => {
    const res = transition(streaming, {
      type: 'stream_error',
      streamError: undefined,
    });
    expect(res.phase.type).toBe('idle');
    expect(res.effects.some((e) => e.type === 'toast')).toBe(true);
  });
});

// --- canSend (the single send precondition: idle ∧ ready) ---

describe('canSend', () => {
  it('idle + ready -> true', () => {
    const phase: ChatPhase = { type: 'idle', messageChain: READY };
    expect(canSend(phase)).toBe(true);
  });

  it('idle + suspended -> false', () => {
    const phase: ChatPhase = {
      type: 'idle',
      messageChain: { type: 'suspended', unresolved: [{ id: 'x', name: 'T' }] },
    };
    expect(canSend(phase)).toBe(false);
  });

  it('sending -> false', () => {
    expect(canSend({ type: 'sending', optimisticMessageId: 'o' })).toBe(false);
  });

  it('streaming -> false', () => {
    expect(canSend({ type: 'streaming' })).toBe(false);
  });
});

// --- Resume ordering regression -------------------------------------------
//
// Bug: after a resume completed, the next user message rendered after the
// FIRST user message (`[u1, u2, a1]`) instead of last (`[u1, a1, u2]`). Root
// cause was the old remove→re-append dance pulling the suspended assistant
// message out of its slot. The fix renders the live stream merged in place by
// id (`effectiveMessages`) and `stream_done` upserts in place — so the message
// keeps its slot. These helpers mirror those two mechanisms exactly.

/** Mirror of `stream_done`'s message transformer (upsert by id). */
const applyStreamDone = (
  prev: ChatMessageWithAttachments[],
  message: ChatMessageWithAttachments
): ChatMessageWithAttachments[] => {
  const res = transition(streaming, { type: 'stream_done', message });
  return res.messages ? res.messages(prev) : prev;
};

/** Mirror of the controller's `effectiveMessages` merge (replace by id, else append). */
const mergeEffective = (
  base: ChatMessageWithAttachments[],
  live: ChatMessageWithAttachments | undefined
): ChatMessageWithAttachments[] => {
  if (!live) return base;
  const idx = base.findIndex((m) => m.id === live.id);
  if (idx === -1) return [...base, live];
  const next = base.slice();
  next[idx] = live;
  return next;
};

describe('resume preserves message order (regression)', () => {
  it('send u1 → suspend a1 → accept/resume → done → send u2 ⇒ [u1, a1, u2]', () => {
    // 1. u1 sent (optimistic), a1 streams in and suspends on a dangling tool.
    let messages: ChatMessageWithAttachments[] = [
      userMsg('u1'),
      assistantMsg('a1', [callPart('x', 'Delete')]),
    ];
    expect(messages.map((m) => m.id)).toEqual(['u1', 'a1']);
    expect(deriveMessageChainFromMessages(messages).type).toBe('suspended');

    // 2. Accept resumes: the suspended message is PATCHED in place with the
    //    resolved parts (it keeps its slot — no remove), then the live stream
    //    attaches under the same message_id.
    messages = messages.map((m) =>
      m.id === 'a1'
        ? assistantMsg('a1', [callPart('x', 'Delete'), respPart('x', 'Delete')])
        : m
    );
    expect(messages.map((m) => m.id)).toEqual(['u1', 'a1']);

    // 3. Live continuation streams (message_id == a1). It merges IN PLACE via
    //    effectiveMessages — a1 keeps its slot, no duplicate, no reordering.
    const liveA1 = assistantMsg('a1', [
      callPart('x', 'Delete'),
      respPart('x', 'Delete'),
      textPart('all done'),
    ]);
    const effective = mergeEffective(messages, liveA1);
    expect(effective.map((m) => m.id)).toEqual(['u1', 'a1']);

    // 4. stream_done upserts the finished a1 in place.
    messages = applyStreamDone(messages, liveA1);
    expect(messages.map((m) => m.id)).toEqual(['u1', 'a1']);
    expect(deriveMessageChainFromMessages(messages).type).toBe('ready');

    // 5. Send u2 — it appends at the END (the bug had it land before a1).
    const sent = transition(idle, {
      type: 'send_started',
      optimisticMessage: userMsg('u2'),
    });
    messages = sent.messages ? sent.messages(messages) : messages;
    expect(messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
  });

  it('a brand-new streaming turn still appends last', () => {
    const base = [userMsg('u1'), assistantMsg('a1', [textPart('hi')])];
    const liveNew = assistantMsg('a2', [textPart('typing…')]);
    expect(mergeEffective(base, liveNew).map((m) => m.id)).toEqual([
      'u1',
      'a1',
      'a2',
    ]);
  });
});
