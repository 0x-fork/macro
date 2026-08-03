import { $getRoot, type ElementNode } from 'lexical';
import { describe, expect, it } from 'vitest';
import { $setText } from '../ai-toolkit/blocks';
import { createEditingSession, loadMarkdown } from '../ai-toolkit/session';

/**
 * `setText` is the most-used editor method in the prod corpus (1,409 calls) and
 * flattens a block to one plain run — deleting bold/code spans, links, mentions
 * and line breaks. That is the mechanism behind judged issues like "lost its
 * bold formatting" and "the mention disappeared".
 *
 * It reports what it removed so callers can reason about it. Note that surfacing
 * this to the coder as a warning was tried and reverted: on the 7 cases where it
 * fired it drove runCode calls 68 -> 99 with purpose-met and correctness flat,
 * i.e. it provoked repair attempts that did not land. The API prompt documents
 * the semantics instead, and cross-run `replace` gives a non-destructive option.
 */
function block(md: string): { block: ElementNode; run: <T>(fn: () => T) => T } {
  const session = createEditingSession();
  loadMarkdown(session, md);
  let el!: ElementNode;
  const run = <T,>(fn: () => T): T => {
    let out!: T;
    session.editor.update(() => {
      el = $getRoot().getFirstChild() as ElementNode;
      out = fn();
    }, { discrete: true });
    return out;
  };
  run(() => undefined);
  return { block: el, run };
}

describe('$setText reports what it destroys', () => {
  it('reports nothing lost for an already-plain block', () => {
    const { block: b, run } = block('plain paragraph');
    const loss = run(() => $setText(b, 'still plain'));
    expect(loss.strippedFormats).toEqual([]);
    expect(loss.removedInline).toEqual([]);
  });

  it('names formatting stripped from the surviving run', () => {
    const { block: b, run } = block('**all bold**');
    const loss = run(() => $setText(b, 'now plain'));
    expect(loss.strippedFormats).toContain('bold');
  });

  it('names sibling runs it removed', () => {
    const { block: b, run } = block('plain and **bold** together');
    const loss = run(() => $setText(b, 'flattened'));
    expect(loss.removedInline.length).toBeGreaterThan(0);
    expect(loss.removedInline).toContain('text run');
  });

  it('still rewrites the block content', () => {
    const { block: b, run } = block('before **x**');
    run(() => $setText(b, 'after'));
    expect(run(() => b.getTextContent())).toBe('after');
  });
});
