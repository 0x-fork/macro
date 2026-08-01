import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { compactDocumentHistory } from './compact';

function toolResult(output: unknown): ModelMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: `c${Math.random()}`,
        toolName: 'dispatch',
        output,
      },
    ],
  } as unknown as ModelMessage;
}

const doc = (body: string) => `✓ APPLIED\n\n<document>\n${body}\n</document>`;

describe('compactDocumentHistory', () => {
  it('leaves a single document untouched', () => {
    const messages = [toolResult(doc('one'))];
    expect(compactDocumentHistory(messages)).toBe(messages);
  });

  it('leaves messages with no documents untouched', () => {
    const messages = [toolResult('ok'), toolResult('ok')];
    expect(compactDocumentHistory(messages)).toBe(messages);
  });

  it('elides all but the newest document', () => {
    const out = compactDocumentHistory([
      toolResult(doc('FIRST')),
      toolResult(doc('SECOND')),
      toolResult(doc('THIRD')),
    ]);
    const text = (m: ModelMessage) =>
      String((m.content as unknown as { output: string }[])[0]!.output);

    expect(text(out[0]!)).not.toContain('FIRST');
    expect(text(out[0]!)).toContain('omitted');
    expect(text(out[1]!)).not.toContain('SECOND');
    // The live state survives verbatim.
    expect(text(out[2]!)).toContain('<document>');
    expect(text(out[2]!)).toContain('THIRD');
  });

  it('keeps the summary that precedes the document', () => {
    const out = compactDocumentHistory([
      toolResult(doc('a')),
      toolResult(doc('b')),
    ]);
    expect(String((out[0]!.content as unknown as { output: string }[])[0]!.output)).toContain(
      '✓ APPLIED'
    );
  });

  it('handles the structured text output shape', () => {
    const out = compactDocumentHistory([
      toolResult({ type: 'text', value: doc('a') }),
      toolResult({ type: 'text', value: doc('b') }),
    ]);
    const first = (out[0]!.content as unknown as { output: { value: string } }[])[0]!.output;
    expect(first.value).not.toContain('>a<');
    expect(first.value).toContain('omitted');
  });

  it('does not mutate the input', () => {
    const messages = [toolResult(doc('a')), toolResult(doc('b'))];
    const before = JSON.stringify(messages);
    compactDocumentHistory(messages);
    expect(JSON.stringify(messages)).toBe(before);
  });

  it('is idempotent', () => {
    const once = compactDocumentHistory([
      toolResult(doc('a')),
      toolResult(doc('b')),
      toolResult(doc('c')),
    ]);
    expect(JSON.stringify(compactDocumentHistory(once))).toBe(
      JSON.stringify(once)
    );
  });
});
