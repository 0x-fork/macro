import { useUserId } from '@core/context/user';
import type { DiffInsertDecoratorProps } from '@lexical-core';
import type { DiffNode } from '@lexical-core/nodes/DiffNode';
import { $getNodeByKey } from 'lexical';
import { createMemo, lazy, Show, Suspense, useContext } from 'solid-js';
import { LexicalWrapperContext } from '../../context/wrapperContext';

// Lazy: StaticMarkdown pulls the markdown parsing stack (@lexical/markdown,
// transformers, prism). Decorators load with the initial bundle via
// initializeLexical(), so the heavy renderer is fetched on first diff render.
const StaticMarkdown = lazy(() =>
  import('../core/StaticMarkdown').then((m) => ({ default: m.StaticMarkdown }))
);

export function DiffInsert(props: DiffInsertDecoratorProps) {
  const wrapper = useContext(LexicalWrapperContext);
  const editor = () => wrapper?.editor;
  const userId = useUserId();

  const shouldShow = createMemo(() => {
    return editor()
      ?.getEditorState()
      .read(() => {
        const node = $getNodeByKey(props.key);
        if (!node) return false;

        const parent = node.getParent();
        // getType() check instead of $isDiffNode: importing the class would
        // pull the markdown transformer stack into the initial bundle.
        if (!parent || parent.getType() !== 'diff') return false;

        return (parent as DiffNode).getUserId() === userId();
      });
  });

  return (
    <Show when={shouldShow()}>
      <div class="md-diff-insert select-none">
        <Suspense>
          <StaticMarkdown markdown={props.markdown} parentEditor={editor()} />
        </Suspense>
      </div>
    </Show>
  );
}
