/**
 * Drop superseded document snapshots from a supervisor conversation.
 *
 * Every `dispatch` result ends with the full post-edit document so the
 * supervisor can verify the change. That is necessary for the newest result and
 * pure cost for the rest: once a later dispatch has reported a newer state, the
 * older copies describe a document that no longer exists, yet they stay in
 * history and are re-billed on every subsequent step.
 *
 * With N dispatches over a D-token document, carrying them all costs O(N²·D)
 * across the session. Keeping only the newest makes it O(N·D) and — because the
 * elided text sits after the cached prefix — leaves caching intact.
 */

import type { ModelMessage } from 'ai';

const DOC_OPEN = '<document>';
const DOC_CLOSE = '</document>';

/** Replace a result's document block with a one-line marker. */
function elideDocument(text: string): string | null {
  const start = text.indexOf(DOC_OPEN);
  const end = text.indexOf(DOC_CLOSE);
  if (start === -1 || end === -1 || end < start) return null;
  const elided = end + DOC_CLOSE.length - start;
  return `${text.slice(0, start)}[document state after this edit omitted — ${elided} chars; see the latest dispatch result for current content]${text.slice(end + DOC_CLOSE.length)}`;
}

function partText(part: unknown): string | null {
  if (typeof part !== 'object' || part === null) return null;
  const output = (part as { output?: unknown }).output;
  if (typeof output === 'string') return output;
  if (
    typeof output === 'object' &&
    output !== null &&
    (output as { type?: string }).type === 'text'
  ) {
    const value = (output as { value?: unknown }).value;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function withText(part: unknown, text: string): unknown {
  const output = (part as { output?: unknown }).output;
  if (typeof output === 'string') return { ...(part as object), output: text };
  return {
    ...(part as object),
    output: { ...(output as object), value: text },
  };
}

/**
 * Return `messages` with every document block elided except the last one.
 *
 * Operates on a copy; the caller's array is untouched.
 */
export function compactDocumentHistory(
  messages: ModelMessage[]
): ModelMessage[] {
  // Locate every tool-result part that carries a document, in order.
  const carriers: { messageIndex: number; partIndex: number }[] = [];
  messages.forEach((message, messageIndex) => {
    if (message.role !== 'tool' || !Array.isArray(message.content)) return;
    message.content.forEach((part, partIndex) => {
      const text = partText(part);
      if (text && text.includes(DOC_OPEN)) {
        carriers.push({ messageIndex, partIndex });
      }
    });
  });

  // Nothing to gain until a newer snapshot has superseded an older one.
  if (carriers.length < 2) return messages;

  const stale = carriers.slice(0, -1);
  const out = [...messages];
  const rewritten = new Map<number, ModelMessage>();

  for (const { messageIndex, partIndex } of stale) {
    const message = (rewritten.get(messageIndex) ??
      out[messageIndex]) as ModelMessage & { content: unknown[] };
    const content = [...message.content] as unknown[];
    const text = partText(content[partIndex]);
    if (!text) continue;
    const elided = elideDocument(text);
    if (elided === null) continue;
    content[partIndex] = withText(content[partIndex], elided) as never;
    const next = { ...message, content } as ModelMessage;
    rewritten.set(messageIndex, next);
    out[messageIndex] = next;
  }

  return out;
}
