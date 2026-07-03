import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from '@lexical/markdown';
import { $getRoot, $isParagraphNode, createEditor } from 'lexical';
import { describe, expect, it } from 'vitest';
import { SupportedNodeTypes } from '../node-list';
import { $createEmbedNode, $isEmbedNode } from '../nodes/EmbedNode';
import { EXTERNAL_TRANSFORMERS, INTERNAL_TRANSFORMERS } from '../transformers';
import {
  findEmbedUrls,
  getTweetId,
  getXHandle,
  getYouTubeStartSeconds,
  getYouTubeVideoId,
  isLoneEmbedUrl,
  parseEmbedUrl,
} from '../utils/embed';

function makeEditor() {
  return createEditor({
    nodes: SupportedNodeTypes,
    onError: console.error,
  });
}

async function importMarkdown(
  markdown: string,
  transformers = INTERNAL_TRANSFORMERS
) {
  const editor = makeEditor();
  await new Promise<void>((resolve) => {
    editor.update(
      () => {
        $convertFromMarkdownString(markdown, transformers);
      },
      { onUpdate: () => resolve() }
    );
  });
  return editor;
}

describe('parseEmbedUrl', () => {
  it('recognizes X/Twitter status urls', () => {
    expect(
      parseEmbedUrl('https://x.com/lulumeservey/status/1234567890123456789')
    ).toEqual({
      provider: 'x',
      url: 'https://x.com/lulumeservey/status/1234567890123456789',
    });
    expect(
      parseEmbedUrl('https://twitter.com/someuser/status/123456?s=20')?.provider
    ).toBe('x');
    expect(
      parseEmbedUrl('https://mobile.twitter.com/someuser/status/123456')
        ?.provider
    ).toBe('x');
    expect(getTweetId('https://x.com/a/status/987654321')).toBe('987654321');
    expect(getXHandle('https://x.com/lulumeservey/status/987654321')).toBe(
      'lulumeservey'
    );
  });

  it('recognizes YouTube urls', () => {
    expect(
      parseEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.provider
    ).toBe('youtube');
    expect(parseEmbedUrl('https://youtu.be/dQw4w9WgXcQ')?.provider).toBe(
      'youtube'
    );
    expect(
      parseEmbedUrl('https://youtube.com/shorts/dQw4w9WgXcQ')?.provider
    ).toBe('youtube');
    expect(
      getYouTubeVideoId('https://www.youtube.com/watch?list=abc&v=dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ');
    expect(getYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('parses YouTube start times', () => {
    expect(getYouTubeStartSeconds('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(
      90
    );
    expect(
      getYouTubeStartSeconds(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s'
      )
    ).toBe(3723);
    expect(
      getYouTubeStartSeconds('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).toBeNull();
  });

  it('recognizes Figma urls', () => {
    expect(
      parseEmbedUrl('https://www.figma.com/design/AbC123/My-File?node-id=1-2')
        ?.provider
    ).toBe('figma');
    expect(
      parseEmbedUrl('https://figma.com/file/AbC123/My-File')?.provider
    ).toBe('figma');
    expect(
      parseEmbedUrl('https://www.figma.com/proto/AbC123/Prototype')?.provider
    ).toBe('figma');
    expect(
      parseEmbedUrl('https://www.figma.com/board/AbC123/FigJam')?.provider
    ).toBe('figma');
  });

  it('rejects non-embeddable urls', () => {
    expect(parseEmbedUrl('https://example.com')).toBeNull();
    expect(parseEmbedUrl('https://x.com/someuser')).toBeNull();
    expect(parseEmbedUrl('https://www.youtube.com/@channel')).toBeNull();
    expect(parseEmbedUrl('https://www.figma.com/community')).toBeNull();
    expect(parseEmbedUrl('not a url')).toBeNull();
  });

  it('isLoneEmbedUrl requires a single embeddable url', () => {
    expect(isLoneEmbedUrl(' https://youtu.be/dQw4w9WgXcQ ')).toBe(true);
    expect(isLoneEmbedUrl('check https://youtu.be/dQw4w9WgXcQ')).toBe(false);
    expect(isLoneEmbedUrl('https://example.com')).toBe(false);
  });
});

describe('findEmbedUrls', () => {
  it('finds embeddable urls in plain text and link tags', () => {
    const text = [
      'check this out https://youtu.be/dQw4w9WgXcQ wow',
      `<m-link>${JSON.stringify({
        url: 'https://x.com/someuser/status/123456',
        text: 'https://x.com/someuser/status/123456',
        title: '',
      })}</m-link>`,
      'not embeddable: https://example.com/page',
    ].join('\n');

    expect(findEmbedUrls(text)).toEqual([
      { provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' },
      { provider: 'x', url: 'https://x.com/someuser/status/123456' },
    ]);
  });

  it('dedupes repeated urls and respects the limit', () => {
    const url = 'https://youtu.be/dQw4w9WgXcQ';
    expect(findEmbedUrls(`${url}\n${url}`)).toHaveLength(1);

    const many = [
      'https://youtu.be/dQw4w9WgXc1',
      'https://youtu.be/dQw4w9WgXc2',
      'https://youtu.be/dQw4w9WgXc3',
    ].join('\n');
    expect(findEmbedUrls(many, 2)).toHaveLength(2);
  });

  it('ignores trailing punctuation', () => {
    expect(findEmbedUrls('see https://youtu.be/dQw4w9WgXcQ.')).toEqual([
      { provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' },
    ]);
  });
});

describe('embed transformer', () => {
  it('round-trips embed nodes through internal markdown', async () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const editor = makeEditor();
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          root.append($createEmbedNode({ provider: 'youtube', url }));
        },
        { onUpdate: () => resolve() }
      );
    });

    let internal = '';
    let external = '';
    editor.getEditorState().read(() => {
      internal = $convertToMarkdownString(INTERNAL_TRANSFORMERS);
      external = $convertToMarkdownString(EXTERNAL_TRANSFORMERS);
    });
    expect(internal).toContain('<m-embed>');
    expect(internal).toContain(url);
    // External markdown degrades to the plain url.
    expect(external).toBe(url);

    const reimported = await importMarkdown(internal);
    reimported.getEditorState().read(() => {
      const node = $getRoot().getChildren().find($isEmbedNode);
      expect(node?.getUrl()).toBe(url);
      expect(node?.getProvider()).toBe('youtube');
    });
  });

  it('derives the provider from the url on import', async () => {
    const url = 'https://x.com/someuser/status/123456';
    const markdown = `<m-embed>${JSON.stringify({
      provider: 'youtube',
      url,
    })}</m-embed>`;
    const editor = await importMarkdown(markdown);
    editor.getEditorState().read(() => {
      const node = $getRoot().getChildren().find($isEmbedNode);
      expect(node?.getProvider()).toBe('x');
    });
  });

  it('does not auto-convert bare url lines', async () => {
    const markdown = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const editor = await importMarkdown(markdown);
    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildren().find($isEmbedNode)).toBeUndefined();
      expect(root.getTextContent()).toBe(markdown);
    });
  });

  it('does not auto-convert lone link tags', async () => {
    const url = 'https://youtu.be/dQw4w9WgXcQ';
    const markdown = `<m-link>${JSON.stringify({
      url,
      text: url,
      title: '',
    })}</m-link>`;
    const editor = await importMarkdown(markdown);
    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildren().find($isEmbedNode)).toBeUndefined();
      expect(root.getTextContent()).toBe(url);
    });
  });

  it('leaves regular paragraphs untouched', async () => {
    const editor = await importMarkdown('just some text');
    editor.getEditorState().read(() => {
      const [child] = $getRoot().getChildren();
      expect($isParagraphNode(child)).toBe(true);
      expect(child.getTextContent()).toBe('just some text');
    });
  });
});
