import type { ChatMessageWithAttachments } from '@core/component/AI/types';
import type { AssistantMessagePart } from '@service-cognition/generated/schemas/assistantMessagePart';
import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';
import {
  createMessageChain,
  deriveMessageChain,
  deriveMessageChainFromMessage,
  deriveMessageChainFromMessages,
  isSuspended,
  READY,
} from './messageChain';

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
const errPart = (
  id: string,
  description: string,
  name = 'T'
): AssistantMessagePart => ({
  type: 'toolCallErr',
  id,
  name,
  description,
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

describe('deriveMessageChain (over parts)', () => {
  it('no parts / text-only is ready', () => {
    expect(deriveMessageChain([])).toEqual(READY);
    expect(deriveMessageChain(undefined)).toEqual(READY);
    expect(deriveMessageChain([textPart('hello')])).toEqual(READY);
  });

  it('all tool calls resolved is ready', () => {
    expect(deriveMessageChain([callPart('a'), respPart('a')])).toEqual(READY);
  });

  it('a denied / cancelled err counts as resolved (ready)', () => {
    expect(deriveMessageChain([callPart('a'), errPart('a', 'denied')])).toEqual(
      READY
    );
    expect(
      deriveMessageChain([callPart('a'), errPart('a', 'cancelled')])
    ).toEqual(READY);
  });

  it('one dangling call is suspended on that call', () => {
    expect(
      deriveMessageChain([
        callPart('a'),
        respPart('a'),
        callPart('b', 'Delete'),
      ])
    ).toEqual({
      type: 'suspended',
      unresolved: [{ id: 'b', name: 'Delete' }],
    });
  });

  it('many dangling calls are suspended in chain order', () => {
    expect(
      deriveMessageChain([callPart('a', 'A'), callPart('b', 'B')])
    ).toEqual({
      type: 'suspended',
      unresolved: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
  });

  it('mcp tool calls count as calls', () => {
    const mcp: AssistantMessagePart = {
      type: 'mcpToolCall',
      id: 'm',
      name: 'mcp__svc__do',
      service: 'svc',
      display_name: null,
      json: {},
    };
    expect(deriveMessageChain([mcp])).toEqual({
      type: 'suspended',
      unresolved: [{ id: 'm', name: 'mcp__svc__do' }],
    });
  });
});

describe('deriveMessageChainFromMessage', () => {
  it('undefined / text message is ready', () => {
    expect(deriveMessageChainFromMessage(undefined)).toEqual(READY);
    expect(deriveMessageChainFromMessage(userMsg('u'))).toEqual(READY);
  });

  it('assistant message with a dangling call is suspended', () => {
    expect(
      deriveMessageChainFromMessage(
        assistantMsg('m1', [callPart('x', 'Delete')])
      )
    ).toEqual({
      type: 'suspended',
      unresolved: [{ id: 'x', name: 'Delete' }],
    });
  });
});

describe('deriveMessageChainFromMessages (the source of truth)', () => {
  it('empty chain is ready', () => {
    expect(deriveMessageChainFromMessages([])).toEqual(READY);
  });

  it('reads the last assistant message', () => {
    const messages = [
      userMsg('u1'),
      assistantMsg('a1', [callPart('x'), respPart('x')]), // resolved
      userMsg('u2'),
      assistantMsg('a2', [callPart('y', 'Delete')]), // dangling
    ];
    expect(deriveMessageChainFromMessages(messages)).toEqual({
      type: 'suspended',
      unresolved: [{ id: 'y', name: 'Delete' }],
    });
  });

  it('refresh-while-suspended: derives suspended from loaded chain', () => {
    const loaded = [userMsg('u1'), assistantMsg('a1', [callPart('x', 'Send')])];
    expect(isSuspended(deriveMessageChainFromMessages(loaded))).toBe(true);
  });

  it('resolved continuation derives ready', () => {
    const messages = [
      userMsg('u1'),
      assistantMsg('a1', [
        callPart('x', 'Delete'),
        respPart('x', 'Delete'),
        textPart('done'),
      ]),
    ];
    expect(deriveMessageChainFromMessages(messages)).toEqual(READY);
  });
});

describe('createMessageChain (the memoized signal)', () => {
  it('derives reactively from the messages signal', () => {
    createRoot((dispose) => {
      const [messages, setMessages] = createSignal<
        ChatMessageWithAttachments[]
      >([userMsg('u1')]);
      const chain = createMessageChain(messages);

      // ready: no assistant tool calls
      expect(chain()).toEqual(READY);

      // becomes suspended when a dangling tool call lands
      setMessages([
        userMsg('u1'),
        assistantMsg('a1', [callPart('x', 'Delete')]),
      ]);
      expect(chain()).toEqual({
        type: 'suspended',
        unresolved: [{ id: 'x', name: 'Delete' }],
      });

      // back to ready once the call resolves
      setMessages([
        userMsg('u1'),
        assistantMsg('a1', [callPart('x', 'Delete'), respPart('x', 'Delete')]),
      ]);
      expect(chain()).toEqual(READY);

      dispose();
    });
  });
});
