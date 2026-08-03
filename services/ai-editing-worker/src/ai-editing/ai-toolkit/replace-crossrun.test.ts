import { describe, expect, it } from 'vitest';
import { createEditingSession, loadMarkdown } from './session';
import { $formatTextInBlock, $replaceString } from './inline';
import { $getRoot, type ElementNode } from 'lexical';
import { serializeWithXml } from '../utils';

/**
 * `replace` used to match one text run at a time, so a needle interrupted by a
 * bold or code span silently matched nothing. That is the largest single source
 * of missed `replace` calls in the prod corpus, and it pushed coders onto
 * `setText`, which flattens the block and destroys the very formatting that
 * caused the miss.
 */
function withBlock<T>(md: string, fn: (block: ElementNode) => T): { result: T; xml: string; session: ReturnType<typeof createEditingSession> } {
  const session = createEditingSession();
  loadMarkdown(session, md);
  let result!: T;
  session.editor.update(
    () => {
      result = fn($getRoot().getFirstChild() as ElementNode);
    },
    { discrete: true }
  );
  return { result, xml: serializeWithXml(session), session };
}

const text = (xml: string) =>
  (xml.match(/<t[^>]*>([^<]*)<\/t>/g) ?? []).map((m) => m.replace(/<[^>]+>/g, '')).join('');

describe('$replaceString across run boundaries', () => {
  it('replaces within a single run', () => {
    const { result, xml } = withBlock('the quick brown fox', (b) =>
      $replaceString(b, 'brown', 'red')
    );
    expect(result).toBe(1);
    expect(text(xml)).toBe('the quick red fox');
  });

  it('replaces a needle that spans a bold boundary', () => {
    const { result, xml } = withBlock('total **408** done', (b) =>
      $replaceString(b, 'total 408', 'total 414')
    );
    expect(result).toBe(1);
    expect(text(xml)).toBe('total 414 done');
  });

  it('replaces a needle spanning three runs', () => {
    const { result, xml } = withBlock('a **b** c', (b) =>
      $replaceString(b, 'a b c', 'flat')
    );
    expect(result).toBe(1);
    expect(text(xml)).toBe('flat');
  });

  it('keeps surrounding formatting intact when the match is inside one run', () => {
    const { xml } = withBlock('keep **bold** and edit tail', (b) =>
      $replaceString(b, 'tail', 'end')
    );
    expect(xml).toContain('bold="true"');
    expect(text(xml)).toBe('keep bold and edit end');
  });

  it('still reports 0 when the text genuinely is not present', () => {
    const { result } = withBlock('alpha beta', (b) =>
      $replaceString(b, 'gamma', 'delta')
    );
    expect(result).toBe(0);
  });

  it('replaces only the first occurrence by default', () => {
    const { result, xml } = withBlock('x and x and x', (b) =>
      $replaceString(b, 'x', 'y')
    );
    expect(result).toBe(1);
    expect(text(xml)).toBe('y and x and x');
  });

  it('replaces every occurrence with scope all', () => {
    const { result, xml } = withBlock('x and x and x', (b) =>
      $replaceString(b, 'x', 'y', { kind: 'all' })
    );
    expect(result).toBe(3);
    expect(text(xml)).toBe('y and y and y');
  });

  it('replaces the nth occurrence', () => {
    const { result, xml } = withBlock('x and x and x', (b) =>
      $replaceString(b, 'x', 'y', { kind: 'nth', n: 2 })
    );
    expect(result).toBe(1);
    expect(text(xml)).toBe('x and y and x');
  });

  it('matches occurrences that themselves span runs, with scope all', () => {
    const { result, xml } = withBlock('go **on** then go **on** again', (b) =>
      $replaceString(b, 'go on', 'stop', { kind: 'all' })
    );
    expect(result).toBe(2);
    expect(text(xml)).toBe('stop then stop again');
  });

  it('handles a replacement that empties a trailing run', () => {
    const { xml } = withBlock('keep **drop**', (b) =>
      $replaceString(b, 'keep drop', 'keep')
    );
    expect(text(xml)).toBe('keep');
  });
});

describe('formatting across run boundaries', () => {
  it('applies a format to a span that crosses a boundary', () => {
    const { xml } = withBlock('total **408** done', (b) =>
      $formatTextInBlock(b, 'total 408', 'code')
    );
    expect(xml).toContain('code="true"');
    expect(text(xml)).toBe('total 408 done');
  });

  it('preserves the formatting already on the crossed run', () => {
    const { xml } = withBlock('total **408** done', (b) =>
      $formatTextInBlock(b, 'total 408', 'code')
    );
    // "408" keeps its bold and additionally gains code.
    expect(xml).toMatch(/<t[^>]*bold="true"[^>]*code="true"|<t[^>]*code="true"[^>]*bold="true"/);
  });

  it('leaves text outside the match untouched', () => {
    const { xml } = withBlock('keep total **408** done', (b) =>
      $formatTextInBlock(b, 'total 408', 'code')
    );
    expect(text(xml)).toBe('keep total 408 done');
    expect(xml).toMatch(/<t id="[^"]+">keep <\/t>/);
  });

  it('reports 0 when the span is genuinely absent', () => {
    const { result } = withBlock('alpha **beta**', (b) =>
      $formatTextInBlock(b, 'gamma delta', 'code')
    );
    expect(result).toBe(0);
  });

  it('counts one occurrence even when it spans several runs', () => {
    const { result } = withBlock('a **b** c', (b) =>
      $formatTextInBlock(b, 'a b c', 'code')
    );
    expect(result).toBe(1);
  });
});
