import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from '@lexical/markdown';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  createEditor,
  type LexicalNode,
} from 'lexical';
import { describe, expect, it } from 'vitest';
import { SupportedNodeTypes } from '../node-list';
import {
  $createLinkMentionNode,
  $isLinkMentionNode,
  type LinkMentionInfo,
  type LinkMentionNode,
} from '../nodes/LinkMentionNode';
import { EXTERNAL_TRANSFORMERS, INTERNAL_TRANSFORMERS } from '../transformers';

function makeEditor() {
  return createEditor({
    nodes: SupportedNodeTypes,
    onError: console.error,
  });
}

async function editorWithMention(info: LinkMentionInfo) {
  const editor = makeEditor();
  await new Promise<void>((resolve) => {
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append(
          $createTextNode('before '),
          $createLinkMentionNode(info),
          $createTextNode(' after')
        );
        root.append(paragraph);
      },
      { onUpdate: () => resolve() }
    );
  });
  return editor;
}

function $findMention(): LinkMentionNode | undefined {
  const inline: LexicalNode[] = [];
  for (const child of $getRoot().getChildren()) {
    if ($isElementNode(child)) inline.push(...child.getChildren());
  }
  return inline.find($isLinkMentionNode);
}

describe('LinkMentionNode transformers', () => {
  it('round-trips through internal markdown', async () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const title = 'Never Gonna Give You Up';
    const editor = await editorWithMention({ url, title });

    let internal = '';
    editor.getEditorState().read(() => {
      internal = $convertToMarkdownString(INTERNAL_TRANSFORMERS);
    });
    expect(internal).toContain('<m-link-mention>');
    expect(internal).toContain(url);

    const reimported = makeEditor();
    await new Promise<void>((resolve) => {
      reimported.update(
        () => {
          $convertFromMarkdownString(internal, INTERNAL_TRANSFORMERS);
        },
        { onUpdate: () => resolve() }
      );
    });
    reimported.getEditorState().read(() => {
      const mention = $findMention();
      expect(mention).toBeDefined();
      expect(mention?.getUrl()).toBe(url);
      expect(mention?.getTitle()).toBe(title);
      expect($getRoot().getTextContent()).toContain('before');
      expect($getRoot().getTextContent()).toContain('after');
    });
  });

  it('exports to external markdown as a titled link', async () => {
    const url = 'https://www.figma.com/design/AbC123/My-File';
    const editor = await editorWithMention({ url, title: 'My File' });

    let external = '';
    editor.getEditorState().read(() => {
      external = $convertToMarkdownString(EXTERNAL_TRANSFORMERS);
    });
    expect(external).toBe(`before [My File](${url}) after`);
  });

  it('exports untitled mentions as the bare url', async () => {
    const url = 'https://x.com/someuser/status/123456';
    const editor = await editorWithMention({ url });

    let external = '';
    editor.getEditorState().read(() => {
      external = $convertToMarkdownString(EXTERNAL_TRANSFORMERS);
    });
    expect(external).toBe(`before ${url} after`);
  });
});
