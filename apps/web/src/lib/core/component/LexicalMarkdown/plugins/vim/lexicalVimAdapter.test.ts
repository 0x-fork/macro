import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import { $createHeadingNode, HeadingNode } from '@lexical/rich-text';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
  type LexicalEditor,
  type LexicalNode,
  ParagraphNode,
  TextNode,
} from 'lexical';
import { beforeEach, describe, expect, test } from 'vitest';
import { createLexicalVimAdapter } from './lexicalVimAdapter';
import type { VimAdapter } from './types';

function createTestEditor(): LexicalEditor {
  const editor = createEditor({
    namespace: 'vim-adapter-test',
    nodes: [ParagraphNode, TextNode, HeadingNode, ListNode, ListItemNode],
    onError: (error) => {
      throw error;
    },
  });
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.appendChild(root);
  editor.setRootElement(root);
  return editor;
}

/** Build a doc from plain strings (one paragraph per entry). */
function seedParagraphs(editor: LexicalEditor, lines: string[]) {
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      for (const line of lines) {
        const p = $createParagraphNode();
        if (line) p.append($createTextNode(line));
        root.append(p);
      }
    },
    { discrete: true }
  );
}

/** Collapse the selection to (blockIndex, textOffset in first text child). */
function placeCursor(
  editor: LexicalEditor,
  blockIndex: number,
  offset: number
) {
  editor.update(
    () => {
      const block = $getRoot().getChildAtIndex(blockIndex);
      if (!block) throw new Error('no block');
      const el = block as import('lexical').ElementNode;
      const text = el.getFirstChild();
      if (text) {
        (text as TextNode).select(offset, offset);
      } else {
        el.select(0, 0);
      }
    },
    { discrete: true }
  );
}

function docLines(editor: LexicalEditor): string[] {
  return editor.getEditorState().read(() =>
    $getRoot()
      .getChildren()
      .map((c: LexicalNode) => c.getTextContent().replaceAll('\n\n', '\n'))
  );
}

describe('createLexicalVimAdapter', () => {
  let editor: LexicalEditor;
  let adapter: VimAdapter;

  beforeEach(() => {
    editor = createTestEditor();
    adapter = createLexicalVimAdapter(editor);
  });

  test('readLine flattens formatted paragraphs and maps the cursor', () => {
    // "hello bold world" split across three text nodes.
    editor.update(
      () => {
        const p = $createParagraphNode();
        const a = $createTextNode('hello ');
        const b = $createTextNode('bold');
        b.setFormat('bold');
        const c = $createTextNode(' world');
        p.append(a, b, c);
        $getRoot().clear().append(p);
        // Cursor inside the bold node at its offset 2 (flat 8).
        b.select(2, 2);
      },
      { discrete: true }
    );

    const line = adapter.readLine();
    expect(line?.blockText).toBe('hello bold world');
    expect(line?.cursor).toBe(8);
    expect(line?.lineStart).toBe(0);
    expect(line?.lineEnd).toBe(16);
  });

  test('setCursorFlat crosses formatted node boundaries', () => {
    editor.update(
      () => {
        const p = $createParagraphNode();
        const a = $createTextNode('abc');
        const b = $createTextNode('def');
        b.setFormat('italic');
        p.append(a, b);
        $getRoot().clear().append(p);
        a.select(0, 0);
      },
      { discrete: true }
    );

    adapter.setCursorFlat(4); // inside the italic node
    const line = adapter.readLine();
    expect(line?.cursor).toBe(4);
  });

  test('deleteFlatRange removes across node boundaries and yanks text', () => {
    editor.update(
      () => {
        const p = $createParagraphNode();
        const a = $createTextNode('foo ');
        const b = $createTextNode('bar');
        b.setFormat('bold');
        const c = $createTextNode(' baz');
        p.append(a, b, c);
        $getRoot().clear().append(p);
        a.select(2, 2);
      },
      { discrete: true }
    );

    const removed = adapter.deleteFlatRange(2, 9);
    expect(removed).toBe('o bar b');
    expect(docLines(editor)).toEqual(['foaz']);
    expect(adapter.readLine()?.cursor).toBe(2);
  });

  test('lineOp delete removes blocks and lands on the following one', () => {
    seedParagraphs(editor, ['one', 'two', 'three']);
    placeCursor(editor, 0, 1);

    const content = adapter.lineOp('delete', 0, 1);
    expect(content).toMatchObject({ kind: 'line', text: 'one\ntwo' });
    expect(docLines(editor)).toEqual(['three']);
    expect(adapter.readLine()?.blockText).toBe('three');
  });

  test('lineOp delete of every block leaves an empty paragraph', () => {
    seedParagraphs(editor, ['only']);
    placeCursor(editor, 0, 0);

    adapter.lineOp('delete', 0, 0);
    expect(docLines(editor)).toEqual(['']);
  });

  test('line yank of a heading pastes back as a heading', () => {
    editor.update(
      () => {
        const h = $createHeadingNode('h2');
        h.append($createTextNode('Title'));
        const p = $createParagraphNode();
        p.append($createTextNode('body'));
        $getRoot().clear().append(h, p);
        h.getFirstChild()?.selectStart();
      },
      { discrete: true }
    );

    const content = adapter.lineOp('yank', 0, 0);
    expect(content?.nodes).toBeDefined();

    // Paste below the heading.
    if (content) adapter.pasteLine(content, true, 1);
    const types = editor.getEditorState().read(() =>
      $getRoot()
        .getChildren()
        .map((c) => c.getType())
    );
    expect(types).toEqual(['heading', 'heading', 'paragraph']);
  });

  test('lineOp change empties the block in place and keeps its type', () => {
    editor.update(
      () => {
        const h = $createHeadingNode('h1');
        h.append($createTextNode('Heading'));
        $getRoot().clear().append(h);
        h.getFirstChild()?.selectStart();
      },
      { discrete: true }
    );

    adapter.lineOp('change', 0, 0);
    editor.getEditorState().read(() => {
      const first = $getRoot().getFirstChild();
      expect(first?.getType()).toBe('heading');
      expect(first?.getTextContent()).toBe('');
    });
  });

  test('joinLines merges paragraphs with a single space', () => {
    seedParagraphs(editor, ['foo', '   bar']);
    placeCursor(editor, 0, 0);

    adapter.joinLines(1);
    expect(docLines(editor)).toEqual(['foo bar']);
    expect(adapter.readLine()?.cursor).toBe(3);
  });

  test('openLine below a list item creates a sibling list item', () => {
    editor.update(
      () => {
        const list = $createListNode('bullet');
        const item = $createListItemNode();
        item.append($createTextNode('first'));
        list.append(item);
        $getRoot().clear().append(list);
        item.getFirstChild()?.selectStart();
      },
      { discrete: true }
    );

    adapter.openLine('below');
    editor.getEditorState().read(() => {
      const list = $getRoot().getFirstChild();
      expect($isListNode(list)).toBe(true);
      if (!$isListNode(list)) return;
      expect(list.getChildrenSize()).toBe(2);
      expect($isListItemNode(list.getChildAtIndex(1))).toBe(true);
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
    });
  });

  test('lineOp delete inside a list drops empty list wrappers', () => {
    editor.update(
      () => {
        const list = $createListNode('bullet');
        const item = $createListItemNode();
        item.append($createTextNode('only item'));
        list.append(item);
        const p = $createParagraphNode();
        p.append($createTextNode('after'));
        $getRoot().clear().append(list, p);
        item.getFirstChild()?.selectStart();
      },
      { discrete: true }
    );

    adapter.lineOp('delete', 0, 0);
    editor.getEditorState().read(() => {
      const children = $getRoot().getChildren();
      expect(children).toHaveLength(1);
      expect(children[0]?.getTextContent()).toBe('after');
    });
  });

  test('visualOp includes the character under the cursor (inclusive fix)', () => {
    seedParagraphs(editor, ['abcdef']);
    // Select a[bc]def — anchor 1, focus 3 — vim-inclusive should take "bcd".
    editor.update(
      () => {
        const p = $getRoot().getFirstChild();
        const text = (p as import('lexical').ElementNode).getFirstChild();
        (text as TextNode).select(1, 3);
      },
      { discrete: true }
    );

    const content = adapter.visualOp('delete', false);
    expect(content?.text).toBe('bcd');
    expect(docLines(editor)).toEqual(['aef']);
  });

  test('visual line op deletes whole blocks regardless of offsets', () => {
    seedParagraphs(editor, ['one', 'two', 'three']);
    // Anchor mid-first-line, focus mid-second-line.
    editor.update(
      () => {
        const root = $getRoot();
        const first = root.getChildAtIndex(0) as import('lexical').ElementNode;
        const second = root.getChildAtIndex(1) as import('lexical').ElementNode;
        const a = first.getFirstChild() as TextNode;
        const f = second.getFirstChild() as TextNode;
        const selection = a.select(1, 1);
        selection.focus.set(f.getKey(), 2, 'text');
      },
      { discrete: true }
    );

    const content = adapter.visualOp('delete', true);
    expect(content).toMatchObject({ kind: 'line', text: 'one\ntwo' });
    expect(docLines(editor)).toEqual(['three']);
  });

  test('pasteChar puts multi-line charwise text back with line breaks', () => {
    seedParagraphs(editor, ['ab']);
    placeCursor(editor, 0, 1);

    adapter.pasteChar('X\nY', true, 1);
    const line = adapter.readLine();
    expect(line?.blockText).toBe('abX\nY');
  });

  test('indentLines adjusts block indent within bounds', () => {
    seedParagraphs(editor, ['line']);
    placeCursor(editor, 0, 0);

    adapter.indentLines(1, 'in');
    editor.getEditorState().read(() => {
      expect(
        (
          $getRoot().getFirstChild() as import('lexical').ElementNode
        ).getIndent()
      ).toBe(1);
    });
    adapter.indentLines(1, 'out');
    adapter.indentLines(1, 'out'); // clamped at 0
    editor.getEditorState().read(() => {
      expect(
        (
          $getRoot().getFirstChild() as import('lexical').ElementNode
        ).getIndent()
      ).toBe(0);
    });
  });
});
