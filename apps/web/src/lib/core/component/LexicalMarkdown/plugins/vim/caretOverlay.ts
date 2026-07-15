/**
 * @file The custom block caret drawn in normal/visual mode.
 *
 * A single fixed-position overlay element is shared by the whole app (only
 * one editor holds focus at a time). The owning editor's vim plugin calls
 * {@link updateCaretOverlay} on selection/scroll/mode changes; positioning
 * reads the live DOM selection, measuring the glyph under the caret so the
 * block hugs the actual character cell (falls back to a `0.6em` cell at
 * line ends and in empty blocks).
 *
 * The native caret is hidden separately via the `vim-caret-hidden` class on
 * the editor root (see vim.css).
 */
import type { LexicalEditor } from 'lexical';

let caretEl: HTMLDivElement | null = null;
let owner: LexicalEditor | null = null;
let rafHandle = 0;

function ensureElement(): HTMLDivElement {
  if (caretEl?.isConnected) return caretEl;
  const el = document.createElement('div');
  el.className = 'vim-block-caret';
  el.style.visibility = 'hidden';
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
  caretEl = el;
  return el;
}

/** Rect of the character cell the block caret should cover. */
function caretCellRect(selection: Selection): DOMRect | null {
  if (selection.rangeCount === 0) return null;
  const focusNode = selection.focusNode;
  if (!focusNode) return null;
  const offset = selection.focusOffset;

  // Preferred: measure the glyph under the caret.
  if (
    focusNode.nodeType === Node.TEXT_NODE &&
    offset < (focusNode.textContent?.length ?? 0)
  ) {
    const range = document.createRange();
    range.setStart(focusNode, offset);
    range.setEnd(focusNode, offset + 1);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return rect;
  }

  // Fallback: collapsed caret rect widened to a monospace-ish cell.
  const range = document.createRange();
  try {
    range.setStart(focusNode, offset);
    range.setEnd(focusNode, offset);
  } catch {
    return null;
  }
  let rect: DOMRect | null = range.getBoundingClientRect();
  if (rect.height === 0) {
    // Element positions (empty paragraphs) report empty rects; fall back to
    // the element's own box.
    const el =
      focusNode instanceof Element ? focusNode : focusNode.parentElement;
    if (!el) return null;
    const elRect = el.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
    rect = new DOMRect(
      elRect.left,
      elRect.top,
      0,
      Number.isFinite(lineHeight) ? lineHeight : elRect.height
    );
  }
  const host =
    focusNode instanceof Element ? focusNode : focusNode.parentElement;
  const fontSize = host
    ? Number.parseFloat(getComputedStyle(host).fontSize)
    : 16;
  return new DOMRect(rect.left, rect.top, fontSize * 0.6, rect.height);
}

function applyPosition(editor: LexicalEditor) {
  const el = ensureElement();
  const root = editor.getRootElement();
  const win = editor._window ?? window;
  const selection = win.getSelection();
  if (!root || !selection || !selection.focusNode) {
    el.style.visibility = 'hidden';
    return;
  }
  // Only draw when the selection actually lives in this editor.
  if (!root.contains(selection.focusNode)) {
    el.style.visibility = 'hidden';
    return;
  }
  const rect = caretCellRect(selection);
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    el.style.visibility = 'hidden';
    return;
  }
  // Clip against the editor's visible box so the caret doesn't float over
  // toolbars when the line is scrolled out of view.
  const rootRect = root.getBoundingClientRect();
  if (rect.bottom < rootRect.top || rect.top > rootRect.bottom) {
    el.style.visibility = 'hidden';
    return;
  }
  el.style.visibility = 'visible';
  el.style.top = `${rect.top}px`;
  el.style.left = `${rect.left}px`;
  el.style.width = `${Math.max(2, rect.width)}px`;
  el.style.height = `${Math.max(4, rect.height)}px`;
}

/**
 * Reposition (or show) the block caret for `editor`. Calls are coalesced
 * into one paint per frame.
 */
export function updateCaretOverlay(editor: LexicalEditor) {
  owner = editor;
  if (rafHandle) return;
  rafHandle = requestAnimationFrame(() => {
    rafHandle = 0;
    if (owner) applyPosition(owner);
  });
}

/** Hide the caret if `editor` currently owns it (blur / insert mode). */
export function hideCaretOverlay(editor: LexicalEditor) {
  if (owner !== editor) return;
  owner = null;
  if (caretEl) caretEl.style.visibility = 'hidden';
}
