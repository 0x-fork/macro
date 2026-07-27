import { SupportedNodeTypes } from '@macro-inc/lexical-core/node-list';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  COMPOSITION_START_COMMAND,
  createEditor,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
} from 'lexical';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  type BlameTooltipState,
  blameTooltipPlugin,
} from './blameTooltipPlugin';

function createTestEditor(props: {
  setState: (state: Partial<BlameTooltipState>) => void;
}): { editor: LexicalEditor; cleanup: () => void } {
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

  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('hello'));
      $getRoot().clear().append(paragraph);
    },
    { discrete: true }
  );

  const unregister = blameTooltipPlugin(props)(editor);

  return {
    editor,
    cleanup: () => {
      unregister();
      editor.setRootElement(null);
      root.remove();
    },
  };
}

describe('blameTooltipPlugin', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  test('dismisses the tooltip on keydown so it does not linger while typing', () => {
    const setState = vi.fn<(state: Partial<BlameTooltipState>) => void>();
    const { editor, cleanup: teardown } = createTestEditor({ setState });
    cleanup = teardown;

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

  test('dismisses the tooltip on composition start (IME input skips KEY_DOWN_COMMAND)', () => {
    const setState = vi.fn<(state: Partial<BlameTooltipState>) => void>();
    const { editor, cleanup: teardown } = createTestEditor({ setState });
    cleanup = teardown;

    setState.mockClear();

    editor.update(
      () => {
        editor.dispatchCommand(
          COMPOSITION_START_COMMAND,
          new CompositionEvent('compositionstart')
        );
      },
      { discrete: true }
    );

    expect(setState).toHaveBeenCalledWith({ hovering: false, nodeId: null });
  });
});
