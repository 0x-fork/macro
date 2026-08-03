import { describe, expect, it } from 'vitest';
import { createEditingSession, loadMarkdown } from '../ai-toolkit/session';
import { docIds } from '../runtime';
import { serializeWithXml } from '../utils';
import { Doc } from './doc';

function build(md: string) {
  const session = createEditingSession();
  loadMarkdown(session, md);
  return { session, doc: new Doc(session), ids: [...docIds(session)] };
}

/** First block id in the document. */
function blockId(md: string) {
  const b = build(md);
  const id = serializeWithXml(b.session).match(/<p id="([^"]+)"/)?.[1];
  return { ...b, id: id! };
}

describe('substring-targeted ops report a miss', () => {
  it('replace throws when the text is absent, quoting what is there', () => {
    const { doc, id } = blockId('the quick brown fox');
    expect(() =>
      doc.apply({ kind: 'replaceText', node: id, find: 'purple', to: 'green' } as never)
    ).toThrow(/does not occur/);
    expect(() =>
      doc.apply({ kind: 'replaceText', node: id, find: 'purple', to: 'green' } as never)
    ).toThrow(/the quick brown fox/);
  });

  it('replace succeeds and does not throw when the text is present', () => {
    const { doc, session, id } = blockId('the quick brown fox');
    doc.apply({ kind: 'replaceText', node: id, find: 'brown', to: 'red' } as never);
    expect(serializeWithXml(session)).toContain('red');
  });

  it('bold throws when the substring is absent', () => {
    const { doc, id } = blockId('alpha beta');
    expect(() =>
      doc.apply({ kind: 'formatText', node: id, match: 'gamma', format: 'bold', on: true } as never)
    ).toThrow(/does not occur/);
  });

  it('link throws when the substring is absent', () => {
    const { doc, id } = blockId('see the docs');
    expect(() =>
      doc.apply({ kind: 'linkText', node: id, match: 'manual', url: 'https://x.test' } as never)
    ).toThrow(/does not occur/);
  });

  /**
   * The failure that produced the corpus's worst silent thrash (trace 213282e2)
   * was a needle spanning text runs. `replace` now matches across runs, so this
   * is no longer an error at all — it just works.
   */
  it('replace now succeeds across a run boundary', () => {
    const { doc, session, id } = blockId('total 408 done');
    doc.apply({ kind: 'formatText', node: id, match: '408', format: 'bold', on: true } as never);
    expect((serializeWithXml(session).match(/<t /g) ?? []).length).toBeGreaterThan(1);

    expect(() =>
      doc.apply({ kind: 'replaceText', node: id, find: 'total 408', to: 'total 414' } as never)
    ).not.toThrow();
    expect(serializeWithXml(session)).toContain('414');
  });

  /**
   * Formatting across a run boundary used to raise, because the matchers walked
   * one run at a time. It now applies to each overlapping segment — the same
   * result as selecting across the boundary in the editor and applying the
   * format — so this is no longer an error either.
   */
  it('formatting now applies across a run boundary', () => {
    const { doc, session, id } = blockId('total 408 done');
    doc.apply({ kind: 'formatText', node: id, match: '408', format: 'bold', on: true } as never);

    expect(() =>
      doc.apply({ kind: 'formatText', node: id, match: 'total 408', format: 'code', on: true } as never)
    ).not.toThrow();
    const xml = serializeWithXml(session);
    expect(xml).toContain('code="true"');
    // the pre-existing bold on "408" survives
    expect(xml).toContain('bold="true"');
  });

  it('clearFormat with no match string still strips everything without throwing', () => {
    const { doc, id } = blockId('alpha beta');
    doc.apply({ kind: 'formatText', node: id, match: 'alpha', format: 'bold', on: true } as never);
    expect(() =>
      doc.apply({ kind: 'clearFormat', node: id, match: undefined } as never)
    ).not.toThrow();
  });
});
