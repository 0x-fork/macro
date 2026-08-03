import { describe, expect, it } from 'vitest';
import { createEditingSession, loadMarkdown } from '../ai-toolkit/session';
import { serializeWithXml } from '../utils';
import { Doc } from './doc';

function build(md: string) {
  const session = createEditingSession();
  loadMarkdown(session, md);
  const doc = new Doc(session);
  const id = serializeWithXml(session).match(/<p id="([^"]+)"/)?.[1]!;
  return { session, doc, id };
}

/**
 * `setText` is the most-used editor method in the prod corpus (1,409 calls) and
 * flattens a block to one plain run — deleting bold/code spans, links, mentions
 * and line breaks. Nothing used to tell the coder, which is the largest single
 * source of "lost the bold formatting" / "the mention disappeared" defects in
 * the judged results. It must now say what it destroyed.
 */
describe('setText reports what it destroys', () => {
  it('stays silent when there was nothing to lose', () => {
    const { doc, id } = build('plain paragraph');
    doc.apply({ kind: 'setText', node: id, text: 'still plain' } as never);
    expect(doc.drainWarnings()).toEqual([]);
  });

  it('warns when it strips formatting from the surviving run', () => {
    const { doc, id } = build('**all bold**');
    doc.apply({ kind: 'setText', node: id, text: 'now plain' } as never);
    const [warning] = doc.drainWarnings();
    expect(warning).toMatch(/DESTROYED/);
    expect(warning).toContain('bold formatting');
  });

  it('warns when it removes sibling inline runs', () => {
    const { doc, id } = build('plain and **bold** together');
    doc.apply({ kind: 'setText', node: id, text: 'flattened' } as never);
    const [warning] = doc.drainWarnings();
    expect(warning).toMatch(/DESTROYED/);
    expect(warning).toMatch(/text run/);
  });

  it('names the node and points at the surgical alternative', () => {
    const { doc, id } = build('keep **this** intact');
    doc.apply({ kind: 'setText', node: id, text: 'oops' } as never);
    const [warning] = doc.drainWarnings();
    expect(warning).toContain(id);
    expect(warning).toMatch(/replace\(id, find, to\)/);
  });

  it('counts repeated losses rather than listing duplicates', () => {
    const { doc, id } = build('a **b** c **d** e');
    doc.apply({ kind: 'setText', node: id, text: 'flat' } as never);
    const [warning] = doc.drainWarnings();
    expect(warning).toMatch(/\dx text run/);
  });

  it('drains, so a later call does not re-report an earlier loss', () => {
    const { doc, id } = build('**bold**');
    doc.apply({ kind: 'setText', node: id, text: 'x' } as never);
    expect(doc.drainWarnings()).toHaveLength(1);
    expect(doc.drainWarnings()).toEqual([]);
  });
});
