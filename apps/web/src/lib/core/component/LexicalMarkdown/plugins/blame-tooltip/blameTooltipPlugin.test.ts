import { SupportedNodeTypes } from '@macro-inc/lexical-core/node-list';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
} from 'lexical';
import { describe, expect, test, vi } from 'vitest';

import {
  type BlameTooltipState,
  blameTooltipPlugin,
} from './blameTooltipPlugin';

function createTestEditor(): LexicalEditor {
  const editor = createEditor({
    namespace: 'blame-tooltip-plugin-test',
    nodes: [...SupportedNodeTypes],
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

describe('blameTooltipPlugin', () => {
  test('dismisses the tooltip on keydown so it does not linger while typing', () => {
    const editor = createTestEditor();
    const setState = vi.fn<(state: Partial<BlameTooltipState>) => void>();

    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('hello'));
        $getRoot().clear().append(paragraph);
      },
      { discrete: true }
    );

    blameTooltipPlugin({ setState })(editor);

    // Simulate the tooltip already being shown from a prior hover.
    setState.mockClear();

    editor.update(
      () => {
        editor.dispatchCommand(
          KEY_DOWN_COMMAND,
          new KeyboardEvent('keydown', { key: 'a' })
        );
      },
      { discrete: true }
    );

    expect(setState).toHaveBeenCalledWith({ hovering: false, nodeId: null });
  });
});
