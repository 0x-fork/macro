import { $isAutoLinkNode } from '@lexical/link';
import { INLINE_CODE, registerMarkdownShortcuts } from '@lexical/markdown';
import { SupportedNodeTypes } from '@macro-inc/lexical-core/node-list';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  createEditor,
  type LexicalEditor,
} from 'lexical';
import { describe, expect, it, test } from 'vitest';

import { findNextAutoLinkMatch, linksPlugin } from './linksPlugin';

function createTestEditor(): LexicalEditor {
  const editor = createEditor({
    namespace: 'links-plugin-test',
    nodes: [...SupportedNodeTypes],
    onError: (error) => {
      throw error;
    },
  });

  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.appendChild(root);
  editor.setRootElement(root);
  linksPlugin({ autoLinkMatchMode: 'common-tlds' })(editor);
  // Also register the real inline-code markdown shortcut (as production does
  // via markdownShortcutsPlugin) so tests exercise the actual interaction
  // between autolinking and the backtick shortcut, not just linksPlugin alone.
  registerMarkdownShortcuts(editor, [INLINE_CODE]);

  return editor;
}

describe('linksPlugin autolink transform', () => {
  test('does not autolink a partial domain match while a raw backtick is still present', () => {
    const editor = createTestEditor();

    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        // Simulates the mid-typing moment right after "`channel.me" has been
        // entered (a valid common-tld match on its own) but before the
        // closing backtick / rest of the word ("ssages`") has arrived. Prior
        // to the fix, this got wrapped into an AutoLinkNode immediately; once
        // the trailing "ssages`" landed, the combined text no longer matched
        // as a domain, so the link never got dissolved and the markdown
        // inline-code shortcut could no longer see one contiguous text node
        // to convert — leaving a stray link for "channel.me" plus plain text.
        paragraph.append($createTextNode('`channel.me'));
        $getRoot().clear().append(paragraph);
      },
      { discrete: true }
    );

    editor.read(() => {
      const paragraph = $getRoot().getFirstChildOrThrow();
      if (!$isElementNode(paragraph)) throw new Error('expected element node');
      const children = paragraph.getChildren();
      expect(children).toHaveLength(1);
      expect($isAutoLinkNode(children[0])).toBe(false);
      expect(children[0].getTextContent()).toBe('`channel.me');
    });
  });

  test('does not leave a stray autolink once the rest of the inline code is typed, and the code shortcut still converts it', () => {
    const editor = createTestEditor();

    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        const textNode = $createTextNode('`channel.me');
        paragraph.append(textNode);
        $getRoot().clear().append(paragraph);
        textNode.select(
          textNode.getTextContentSize(),
          textNode.getTextContentSize()
        );
      },
      { discrete: true }
    );

    // Continue "typing" the rest of the word and the closing backtick, one
    // character at a time via the same selection.insertText() path real
    // typing goes through — the markdown code-format shortcut keys off
    // incremental single-character selection changes, not just final text.
    for (const char of 'ssages`') {
      editor.update(
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertText(char);
          }
        },
        { discrete: true }
      );
    }

    editor.read(() => {
      const paragraph = $getRoot().getFirstChildOrThrow();
      if (!$isElementNode(paragraph)) throw new Error('expected element node');
      const children = paragraph.getChildren();
      expect(children.some((child) => $isAutoLinkNode(child))).toBe(false);
      // The backtick shortcut should still be able to convert the completed
      // span into actual inline code, since no stray AutoLinkNode is left
      // splitting the text into separate nodes.
      expect(paragraph.getTextContent()).toBe('channel.messages');
      expect(
        children.some((child) => $isTextNode(child) && child.hasFormat('code'))
      ).toBe(true);
    });
  });

  test('still autolinks plain text without backticks', () => {
    const editor = createTestEditor();

    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Visit example.com'));
        $getRoot().clear().append(paragraph);
      },
      { discrete: true }
    );

    editor.read(() => {
      const paragraph = $getRoot().getFirstChildOrThrow();
      if (!$isElementNode(paragraph)) throw new Error('expected element node');
      const children = paragraph.getChildren();
      expect(children.some((child) => $isAutoLinkNode(child))).toBe(true);
    });
  });
});

describe('findNextAutoLinkMatch', () => {
  it('requires a protocol in protocol mode', () => {
    expect(findNextAutoLinkMatch('Visit example.com')).toBeNull();
    expect(findNextAutoLinkMatch('Visit https://example.rs')?.url).toBe(
      'https://example.rs'
    );
  });

  it('matches common bare TLDs in common-tlds mode', () => {
    expect(findNextAutoLinkMatch('Visit example.com', 'common-tlds')?.url).toBe(
      'https://example.com'
    );
    expect(findNextAutoLinkMatch('Visit macro.co', 'common-tlds')?.url).toBe(
      'https://macro.co'
    );
    expect(findNextAutoLinkMatch('Visit example.org', 'common-tlds')?.url).toBe(
      'https://example.org'
    );
  });

  it('does not match file-like non-curated TLDs in common-tlds mode', () => {
    expect(findNextAutoLinkMatch('Open main.rs', 'common-tlds')).toBeNull();
    expect(findNextAutoLinkMatch('Open parser.ts', 'common-tlds')).toBeNull();
    expect(findNextAutoLinkMatch('Open types.d.ts', 'common-tlds')).toBeNull();
  });

  it('keeps fuzzy mode available for callers that want broader matching', () => {
    expect(findNextAutoLinkMatch('Visit example.rs', 'fuzzy')?.url).toBe(
      'https://example.rs'
    );
  });
});
