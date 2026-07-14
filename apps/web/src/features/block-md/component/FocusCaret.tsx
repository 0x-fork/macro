import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { mdStore } from '../signal/markdownBlockData';

interface CaretRect {
  left: number;
  top: number;
  height: number;
}

/**
 * Solid, non-blinking accent-colored caret shown in writer (focus) mode. The
 * native caret is hidden via `.writer-focus` (see LexicalMarkdown/styles.css)
 * and this overlay tracks the collapsed DOM selection instead, iA-Writer
 * style. Renders nothing while the selection is outside the notebook, is a
 * range selection, or the editor is unfocused.
 */
export function FocusCaret() {
  const md = mdStore.get;
  const [rect, setRect] = createSignal<CaretRect>();

  const update = () => {
    const notebook = md.notebook;
    const selection = window.getSelection();
    const activeElement = document.activeElement;
    if (
      !notebook ||
      !selection ||
      selection.rangeCount === 0 ||
      !selection.isCollapsed ||
      !selection.anchorNode ||
      !notebook.contains(selection.anchorNode) ||
      !activeElement ||
      !notebook.contains(activeElement)
    ) {
      setRect(undefined);
      return;
    }

    const range = selection.getRangeAt(0);
    let caretRect: DOMRect | undefined =
      range.getClientRects()[0] ?? range.getBoundingClientRect();

    // Empty lines report a zero rect — fall back to the containing element's
    // position and line height.
    if (!caretRect || caretRect.height === 0) {
      const node = range.startContainer;
      const el = node instanceof Element ? node : node.parentElement;
      if (!el) {
        setRect(undefined);
        return;
      }
      const elRect = el.getBoundingClientRect();
      const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
      caretRect = new DOMRect(
        elRect.left,
        elRect.top,
        0,
        Number.isNaN(lineHeight) ? elRect.height : lineHeight
      );
    }

    setRect({
      left: caretRect.left,
      top: caretRect.top,
      height: caretRect.height,
    });
  };

  onMount(() => {
    update();
    document.addEventListener('selectionchange', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    onCleanup(() => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    });
  });

  return (
    <Show when={rect()}>
      {(r) => (
        <div
          class="pointer-events-none fixed z-10 w-0.5 rounded-full bg-accent"
          style={{
            left: `${r().left}px`,
            top: `${r().top}px`,
            height: `${r().height}px`,
          }}
        />
      )}
    </Show>
  );
}
