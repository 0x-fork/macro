/**
 * @file Lexical implementation of the {@link VimAdapter} interface.
 *
 * Positioning model: vim thinks in "lines" — here a line is a *leaf block*
 * (paragraph, heading, list item, quote, table-cell paragraph…): the nearest
 * non-inline element that directly carries inline content. Each leaf block is
 * flattened to a plain string (`\n` for soft breaks, one object-replacement
 * char per inline decorator) so the engine can run pure string scans, and
 * flat offsets are mapped back to Lexical points to move the selection or
 * edit content.
 *
 * Vertical movement intentionally goes through the native
 * `Selection.modify(…, 'line')` API (per-visual-line, keeps the goal
 * column); Lexical picks the new position up through its own
 * `selectionchange` handling.
 */
import {
  $createListItemNode,
  $isListItemNode,
  $isListNode,
} from '@lexical/list';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  $parseSerializedNode,
  $setSelection,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type PointType,
  type RangeSelection,
  REDO_COMMAND,
  type SerializedLexicalNode,
  UNDO_COMMAND,
} from 'lexical';
import { lineBoundsAt, toggleCase } from './textMotions';
import type {
  LineContext,
  LineOpKind,
  RegisterContent,
  VimAdapter,
} from './types';

/** Placeholder char for inline decorators (mentions, equations, …). */
const ATOM_CHAR = '￼';

type PointDescriptor = {
  key: string;
  offset: number;
  type: 'text' | 'element';
};

type FlatBlock = {
  block: ElementNode;
  text: string;
  /** Leaf segments in order: text nodes and single-char atoms. */
  segments: Array<{
    start: number;
    end: number;
    kind: 'text' | 'atom';
    key: string;
    parentKey: string;
    childIndex: number;
  }>;
  /** Flat span covered by every visited node (inline elements included). */
  spans: Map<string, { start: number; end: number }>;
};

/** True when `node` is a block-level element that directly hosts a line of
 * inline content (its own text run), e.g. paragraph/heading/listitem.
 * (Deliberately not a type predicate: callers negate this on values already
 * narrowed to ElementNode, which a predicate would collapse to `never`.) */
function $isLeafBlock(node: LexicalNode): boolean {
  if (!$isElementNode(node) || node.isInline() || $isRootNode(node)) {
    return false;
  }
  const children = node.getChildren();
  if (children.length === 0) return true;
  let hasBlockChild = false;
  let hasInlineChild = false;
  for (const child of children) {
    if (
      $isTextNode(child) ||
      $isLineBreakNode(child) ||
      (($isElementNode(child) || $isDecoratorNode(child)) && child.isInline())
    ) {
      hasInlineChild = true;
    } else {
      hasBlockChild = true;
    }
  }
  return hasInlineChild || !hasBlockChild;
}

/** DFS collecting every leaf block in document order. */
function $leafBlocks(): ElementNode[] {
  const out: ElementNode[] = [];
  const visit = (node: LexicalNode) => {
    if (!$isElementNode(node)) return;
    if ($isLeafBlock(node)) {
      out.push(node);
      // A list item can carry a nested list after its inline content.
      for (const child of node.getChildren()) {
        if ($isElementNode(child) && !child.isInline()) visit(child);
      }
      return;
    }
    for (const child of node.getChildren()) visit(child);
  };
  visit($getRoot());
  return out;
}

/** The leaf block containing a selection point (climbing, then descending). */
function $leafBlockOf(point: PointType): ElementNode | null {
  let node: LexicalNode | null = point.getNode();
  if ($isElementNode(node) && !node.isInline() && !$isLeafBlock(node)) {
    // Element point on a container (e.g. root): descend via the child index.
    const el: ElementNode = node;
    const child =
      el.getChildAtIndex(Math.min(point.offset, el.getChildrenSize() - 1)) ??
      el.getFirstChild();
    if (child) node = child;
  }
  while (node) {
    if ($isElementNode(node) && $isLeafBlock(node)) return node;
    node = node.getParent();
  }
  return null;
}

/** Flatten a leaf block's inline content into plain text + offset maps. */
function $flattenBlock(block: ElementNode): FlatBlock {
  const flat: FlatBlock = { block, text: '', segments: [], spans: new Map() };
  const walk = (el: ElementNode) => {
    for (const child of el.getChildren()) {
      const start = flat.text.length;
      const childIndex = child.getIndexWithinParent();
      if ($isTextNode(child)) {
        flat.text += child.getTextContent();
        flat.segments.push({
          start,
          end: flat.text.length,
          kind: 'text',
          key: child.getKey(),
          parentKey: el.getKey(),
          childIndex,
        });
      } else if ($isLineBreakNode(child)) {
        flat.text += '\n';
        flat.segments.push({
          start,
          end: start + 1,
          kind: 'atom',
          key: child.getKey(),
          parentKey: el.getKey(),
          childIndex,
        });
      } else if ($isElementNode(child) && child.isInline()) {
        walk(child);
      } else if ($isDecoratorNode(child) && child.isInline()) {
        flat.text += ATOM_CHAR;
        flat.segments.push({
          start,
          end: start + 1,
          kind: 'atom',
          key: child.getKey(),
          parentKey: el.getKey(),
          childIndex,
        });
      }
      // Non-inline children (nested lists) are separate "lines" — skipped.
      flat.spans.set(child.getKey(), { start, end: flat.text.length });
    }
  };
  walk(block);
  flat.spans.set(block.getKey(), { start: 0, end: flat.text.length });
  return flat;
}

/** Map a flat offset back to a Lexical point within the block. */
function pointForFlat(flat: FlatBlock, offset: number): PointDescriptor {
  const clamped = Math.max(0, Math.min(offset, flat.text.length));
  for (const seg of flat.segments) {
    if (clamped < seg.start || clamped > seg.end) continue;
    if (seg.kind === 'text') {
      // Prefer the following text segment when sitting on a boundary shared
      // with it, so the cursor associates forward.
      if (clamped === seg.end) {
        const next = flat.segments.find(
          (s) => s.start === clamped && s.kind === 'text'
        );
        if (next) {
          return { key: next.key, offset: 0, type: 'text' };
        }
      }
      return { key: seg.key, offset: clamped - seg.start, type: 'text' };
    }
    // Atom: place before or after it (element point in its parent).
    const after = clamped >= seg.end;
    return {
      key: seg.parentKey,
      offset: seg.childIndex + (after ? 1 : 0),
      type: 'element',
    };
  }
  // Empty block (or past the end).
  return {
    key: flat.block.getKey(),
    offset: flat.block.getChildrenSize(),
    type: 'element',
  };
}

/** Map a Lexical point to a flat offset within the block (null if outside). */
function flatForPoint(flat: FlatBlock, point: PointType): number | null {
  if (point.type === 'text') {
    const seg = flat.segments.find(
      (s) => s.kind === 'text' && s.key === point.key
    );
    return seg ? seg.start + point.offset : null;
  }
  const node = point.getNode();
  if (!$isElementNode(node)) return null;
  const span = flat.spans.get(node.getKey());
  if (!span && node.getKey() !== flat.block.getKey()) return null;
  if (point.offset === 0) return span?.start ?? 0;
  const child = node.getChildAtIndex(point.offset - 1);
  if (!child) return span?.start ?? 0;
  const childSpan = flat.spans.get(child.getKey());
  return childSpan?.end ?? span?.end ?? flat.text.length;
}

function $setCollapsedSelection(point: PointDescriptor) {
  const selection = $createRangeSelection();
  selection.anchor.set(point.key, point.offset, point.type);
  selection.focus.set(point.key, point.offset, point.type);
  $setSelection(selection);
}

function $setRangeSelection(anchor: PointDescriptor, focus: PointDescriptor) {
  const selection = $createRangeSelection();
  selection.anchor.set(anchor.key, anchor.offset, anchor.type);
  selection.focus.set(focus.key, focus.offset, focus.type);
  $setSelection(selection);
}

function $currentBlockFlat(): {
  flat: FlatBlock;
  cursor: number;
  selection: RangeSelection;
} | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const block = $leafBlockOf(selection.focus);
  if (!block) return null;
  const flat = $flattenBlock(block);
  const cursor = flatForPoint(flat, selection.focus);
  if (cursor === null) return null;
  return { flat, cursor, selection };
}

/** Remove a leaf block plus any list wrappers left empty behind it. */
function $removeBlockAndEmptyAncestors(block: ElementNode) {
  let parent = block.getParent();
  block.remove();
  while (
    parent &&
    ($isListNode(parent) || $isListItemNode(parent)) &&
    parent.getChildrenSize() === 0
  ) {
    const next: ElementNode | null = parent.getParent();
    parent.remove();
    parent = next;
  }
}

/** Yank content for a run of leaf blocks. */
function $yankBlocks(blocks: ElementNode[]): RegisterContent {
  const text = blocks.map((b) => $flattenBlock(b).text).join('\n');
  const allRootLevel = blocks.every((b) => $isRootNode(b.getParent()));
  const nodes = allRootLevel
    ? blocks.map((b) => b.exportJSON() as SerializedLexicalNode)
    : undefined;
  return { kind: 'line', text, nodes };
}

/** Ensure the root always has at least one block; returns the paragraph. */
function $ensureNonEmptyRoot(): ElementNode | null {
  const root = $getRoot();
  if (root.getChildrenSize() > 0) return null;
  const p = $createParagraphNode();
  root.append(p);
  return p;
}

/** Scroll the DOM selection's line into view after a native move. */
function scrollDomSelectionIntoView(editor: LexicalEditor) {
  const win = editor._window ?? window;
  const domSelection = win.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) return;
  const node = domSelection.focusNode;
  if (!node) return;
  const el = node instanceof Element ? node : node.parentElement;
  const rect = el?.getBoundingClientRect();
  if (!el || !rect) return;
  if (rect.top < 0 || rect.bottom > win.innerHeight) {
    el.scrollIntoView({ block: 'nearest' });
  }
}

/** Split register text into lines and build paragraph nodes from them. */
function $paragraphsFromText(text: string): ElementNode[] {
  return text.split('\n').map((line) => {
    const p = $createParagraphNode();
    if (line) p.append($createTextNode(line));
    return p;
  });
}

/**
 * The inclusive-range fix for visual operations: vim's visual selections
 * include the character under the cursor, while DOM selections are
 * exclusive of their focus boundary. Returns ordered start/end points with
 * the later point advanced one character (clamped to its block).
 */
function $inclusiveOrderedPoints(selection: RangeSelection): {
  start: PointDescriptor;
  end: PointDescriptor;
} {
  const backward = selection.isBackward();
  const startPoint = backward ? selection.focus : selection.anchor;
  const endPoint = backward ? selection.anchor : selection.focus;
  const start: PointDescriptor = {
    key: startPoint.key,
    offset: startPoint.offset,
    type: startPoint.type,
  };
  let end: PointDescriptor = {
    key: endPoint.key,
    offset: endPoint.offset,
    type: endPoint.type,
  };
  const endBlock = $leafBlockOf(endPoint);
  if (endBlock) {
    const flat = $flattenBlock(endBlock);
    const flatEnd = flatForPoint(flat, endPoint);
    if (flatEnd !== null && flatEnd < flat.text.length) {
      end = pointForFlat(flat, flatEnd + 1);
    }
  }
  return { start, end };
}

/** Create the vim adapter for a Lexical editor instance. */
export function createLexicalVimAdapter(editor: LexicalEditor): VimAdapter {
  const update = (fn: () => void) => {
    editor.update(fn, { discrete: true });
  };

  const adapter: VimAdapter = {
    editor,

    readLine(): LineContext | null {
      return editor.getEditorState().read(() => {
        const ctx = $currentBlockFlat();
        if (!ctx) return null;
        const bounds = lineBoundsAt(ctx.flat.text, ctx.cursor);
        return {
          blockText: ctx.flat.text,
          cursor: ctx.cursor,
          lineStart: bounds.start,
          lineEnd: bounds.end,
        };
      });
    },

    setCursorFlat(offset) {
      update(() => {
        const ctx = $currentBlockFlat();
        if (!ctx) return;
        $setCollapsedSelection(pointForFlat(ctx.flat, offset));
      });
    },

    selectToFlat(offset) {
      update(() => {
        const ctx = $currentBlockFlat();
        if (!ctx) return;
        const focus = pointForFlat(ctx.flat, offset);
        const anchor = ctx.selection.anchor;
        $setRangeSelection(
          { key: anchor.key, offset: anchor.offset, type: anchor.type },
          focus
        );
      });
    },

    moveVertical(dir, count, extend) {
      const win = editor._window ?? window;
      const domSelection = win.getSelection();
      if (!domSelection) return;
      for (let i = 0; i < count; i++) {
        domSelection.modify(
          extend ? 'extend' : 'move',
          dir > 0 ? 'forward' : 'backward',
          'line'
        );
      }
      scrollDomSelectionIntoView(editor);
    },

    moveBlockBoundary(dir, count, extend) {
      update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const current = $leafBlockOf(selection.focus);
        if (!current) return;
        const blocks = $leafBlocks();
        const idx = blocks.findIndex((b) => b.is(current));
        if (idx === -1) return;
        const target =
          blocks[Math.max(0, Math.min(blocks.length - 1, idx + dir * count))];
        if (!target) return;
        const flat = $flattenBlock(target);
        const point = pointForFlat(flat, dir > 0 ? flat.text.length : 0);
        if (extend) {
          const anchor = selection.anchor;
          $setRangeSelection(
            { key: anchor.key, offset: anchor.offset, type: anchor.type },
            point
          );
        } else {
          $setCollapsedSelection(point);
        }
      });
    },

    moveDocEdge(edge, extend) {
      update(() => {
        const blocks = $leafBlocks();
        const target = edge === 'start' ? blocks[0] : blocks[blocks.length - 1];
        if (!target) return;
        const flat = $flattenBlock(target);
        const point = pointForFlat(flat, 0);
        if (extend) {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const anchor = selection.anchor;
          $setRangeSelection(
            { key: anchor.key, offset: anchor.offset, type: anchor.type },
            point
          );
        } else {
          $setCollapsedSelection(point);
        }
      });
    },

    moveToAdjacentBlock(dir, edge) {
      let moved = false;
      update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const current = $leafBlockOf(selection.focus);
        if (!current) return;
        const blocks = $leafBlocks();
        const idx = blocks.findIndex((b) => b.is(current));
        const target = blocks[idx + dir];
        if (!target) return;
        const flat = $flattenBlock(target);
        $setCollapsedSelection(
          pointForFlat(
            flat,
            edge === 'start' ? 0 : Math.max(0, flat.text.length - 1)
          )
        );
        moved = true;
      });
      return moved;
    },

    readFlatRange(start, end) {
      return editor.getEditorState().read(() => {
        const ctx = $currentBlockFlat();
        if (!ctx) return '';
        return ctx.flat.text.slice(start, end);
      });
    },

    deleteFlatRange(start, end) {
      let removed = '';
      update(() => {
        const ctx = $currentBlockFlat();
        if (!ctx || end <= start) return;
        removed = ctx.flat.text.slice(start, end);
        $setRangeSelection(
          pointForFlat(ctx.flat, start),
          pointForFlat(ctx.flat, end)
        );
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.removeText();
      });
      return removed;
    },

    replaceFlatRange(start, end, text) {
      update(() => {
        const ctx = $currentBlockFlat();
        if (!ctx) return;
        $setRangeSelection(
          pointForFlat(ctx.flat, start),
          pointForFlat(ctx.flat, end)
        );
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(text);
      });
    },

    toggleCaseFlatRange(start, end) {
      update(() => {
        const ctx = $currentBlockFlat();
        if (!ctx || end <= start) return;
        const toggled = toggleCase(ctx.flat.text.slice(start, end));
        $setRangeSelection(
          pointForFlat(ctx.flat, start),
          pointForFlat(ctx.flat, end)
        );
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(toggled);
      });
    },

    insertText(text) {
      update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(text);
      });
    },

    insertParagraph() {
      update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertParagraph();
      });
    },

    openLine(where) {
      update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const block = $leafBlockOf(selection.focus);
        if (!block) return;
        // Stay inside the list: o on a list item opens a sibling item.
        const newLine = $isListItemNode(block)
          ? $createListItemNode()
          : $createParagraphNode();
        if (where === 'below') block.insertAfter(newLine);
        else block.insertBefore(newLine);
        newLine.select(0, 0);
      });
    },

    joinLines(count) {
      update(() => {
        for (let i = 0; i < count; i++) {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const current = $leafBlockOf(selection.focus);
          if (!current) return;
          const blocks = $leafBlocks();
          const idx = blocks.findIndex((b) => b.is(current));
          const next = blocks[idx + 1];
          if (!next) return;

          const seamOffset = $flattenBlock(current).text.length;

          // vim J: single space between the joined lines; leading blanks of
          // the next line are dropped.
          const children = next.getChildren();
          let strippedLeading = false;
          const inline: LexicalNode[] = [];
          const blocksAfter: LexicalNode[] = [];
          for (const child of children) {
            if ($isElementNode(child) && !child.isInline()) {
              blocksAfter.push(child);
              continue;
            }
            if (!strippedLeading && $isTextNode(child)) {
              const stripped = child.getTextContent().replace(/^[ \t]+/, '');
              if (stripped === '') {
                child.remove();
                continue;
              }
              child.setTextContent(stripped);
              strippedLeading = true;
            } else {
              strippedLeading = true;
            }
            inline.push(child);
          }
          if (seamOffset > 0 && inline.length > 0) {
            current.append($createTextNode(' '));
          }
          for (const child of inline) current.append(child);
          // Nested blocks (e.g. a sub-list) survive as siblings after us.
          for (const child of blocksAfter.reverse()) {
            current.insertAfter(child);
          }
          $removeBlockAndEmptyAncestors(next);

          const flat = $flattenBlock(current);
          $setCollapsedSelection(
            pointForFlat(flat, Math.min(seamOffset, flat.text.length))
          );
        }
      });
    },

    indentLines(count, dir) {
      update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const block = $leafBlockOf(selection.focus);
        if (!block) return;
        const blocks = $leafBlocks();
        const idx = blocks.findIndex((b) => b.is(block));
        for (let i = idx; i < Math.min(blocks.length, idx + count); i++) {
          const b = blocks[i];
          if (!b) continue;
          const indent = b.getIndent();
          b.setIndent(Math.max(0, indent + (dir === 'in' ? 1 : -1)));
        }
      });
    },

    lineOp(op, startDelta, endDelta) {
      return runLineOp(op, (blocks, idx) => {
        const s = Math.max(0, Math.min(blocks.length - 1, idx + startDelta));
        const e = Math.max(0, Math.min(blocks.length - 1, idx + endDelta));
        return [s, e];
      });
    },

    lineOpToEdge(op, edge) {
      return runLineOp(op, (blocks, idx) =>
        edge === 'start' ? [0, idx] : [idx, blocks.length - 1]
      );
    },

    pasteChar(text, after, count) {
      update(() => {
        const ctx = $currentBlockFlat();
        if (!ctx) return;
        const bounds = lineBoundsAt(ctx.flat.text, ctx.cursor);
        const insertAt =
          after && ctx.cursor < bounds.end ? ctx.cursor + 1 : ctx.cursor;
        $setCollapsedSelection(pointForFlat(ctx.flat, insertAt));
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const payload = text.repeat(count);
        const parts = payload.split('\n');
        parts.forEach((part, i) => {
          if (i > 0) selection.insertNodes([$createLineBreakNode()]);
          if (part) selection.insertText(part);
        });
        // vim leaves the cursor on the last pasted character.
        const refreshed = $currentBlockFlat();
        if (refreshed && refreshed.cursor > 0) {
          $setCollapsedSelection(
            pointForFlat(refreshed.flat, refreshed.cursor - 1)
          );
        }
      });
    },

    pasteLine(content, after, count) {
      update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const block = $leafBlockOf(selection.focus);
        if (!block) return;
        let firstPasted: LexicalNode | null = null;
        let insertRef: LexicalNode = block;
        for (let n = 0; n < count; n++) {
          const nodes = buildRegisterNodes(content, block);
          for (const node of nodes) {
            if (after) {
              insertRef.insertAfter(node);
              insertRef = node;
            } else {
              // Insert the batch before the block, preserving order.
              if (firstPasted === null) block.insertBefore(node);
              else insertRef.insertAfter(node);
              insertRef = node;
            }
            firstPasted ??= node;
          }
        }
        if (firstPasted && $isElementNode(firstPasted)) {
          firstPasted.select(0, 0);
        }
      });
    },

    visualOp(op, linewise) {
      let content: RegisterContent | null = null;
      update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        if (linewise) {
          const backward = selection.isBackward();
          const startBlock = $leafBlockOf(
            backward ? selection.focus : selection.anchor
          );
          const endBlock = $leafBlockOf(
            backward ? selection.anchor : selection.focus
          );
          if (!startBlock || !endBlock) return;
          const blocks = $leafBlocks();
          const s = blocks.findIndex((b) => b.is(startBlock));
          const e = blocks.findIndex((b) => b.is(endBlock));
          if (s === -1 || e === -1) return;
          content = $applyLineOpToBlocks(
            op,
            blocks.slice(Math.min(s, e), Math.max(s, e) + 1)
          );
          return;
        }

        const { start, end } = $inclusiveOrderedPoints(selection);
        $setRangeSelection(start, end);
        const applied = $getSelection();
        if (!$isRangeSelection(applied)) return;
        content = { kind: 'char', text: applied.getTextContent() };
        if (op === 'yank') {
          $setCollapsedSelection(start);
        } else {
          applied.removeText();
        }
      });
      return content;
    },

    visualPaste(content) {
      update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const { start, end } = $inclusiveOrderedPoints(selection);
        $setRangeSelection(start, end);
        const applied = $getSelection();
        if (!$isRangeSelection(applied)) return;
        if (content.kind === 'char') {
          applied.insertText(content.text);
        } else {
          applied.removeText();
          const after = $getSelection();
          if ($isRangeSelection(after)) {
            after.insertNodes($paragraphsFromText(content.text));
          }
        }
      });
    },

    visualIndent(dir, count) {
      update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const backward = selection.isBackward();
        const startBlock = $leafBlockOf(
          backward ? selection.focus : selection.anchor
        );
        const endBlock = $leafBlockOf(
          backward ? selection.anchor : selection.focus
        );
        if (!startBlock || !endBlock) return;
        const blocks = $leafBlocks();
        const s = blocks.findIndex((b) => b.is(startBlock));
        const e = blocks.findIndex((b) => b.is(endBlock));
        for (let i = Math.min(s, e); i <= Math.max(s, e); i++) {
          const b = blocks[i];
          if (!b) continue;
          b.setIndent(
            Math.max(0, b.getIndent() + (dir === 'in' ? count : -count))
          );
        }
        const target = blocks[Math.min(s, e)];
        if (target?.isAttached()) {
          const flat = $flattenBlock(target);
          $setCollapsedSelection(pointForFlat(flat, 0));
        }
      });
    },

    visualToggleCase() {
      update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const { start, end } = $inclusiveOrderedPoints(selection);
        $setRangeSelection(start, end);
        const applied = $getSelection();
        if (!$isRangeSelection(applied)) return;
        const toggled = toggleCase(applied.getTextContent());
        applied.insertText(toggled);
        $setCollapsedSelection(start);
      });
    },

    visualSwapEnds() {
      update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const { anchor, focus } = selection;
        $setRangeSelection(
          { key: focus.key, offset: focus.offset, type: focus.type },
          { key: anchor.key, offset: anchor.offset, type: anchor.type }
        );
      });
    },

    expandSelectionToLines() {
      update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const backward = selection.isBackward();
        const startBlock = $leafBlockOf(
          backward ? selection.focus : selection.anchor
        );
        const endBlock = $leafBlockOf(
          backward ? selection.anchor : selection.focus
        );
        if (!startBlock || !endBlock) return;
        const startFlat = $flattenBlock(startBlock);
        const endFlat = $flattenBlock(endBlock);
        const startPoint = pointForFlat(startFlat, 0);
        const endPoint = pointForFlat(endFlat, endFlat.text.length);
        // Keep the cursor (focus) on the same side the user is extending.
        if (backward) $setRangeSelection(endPoint, startPoint);
        else $setRangeSelection(startPoint, endPoint);
      });
    },

    collapseSelection(to) {
      update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const point =
          to === 'focus'
            ? selection.focus
            : selection.isBackward()
              ? selection.focus
              : selection.anchor;
        $setCollapsedSelection({
          key: point.key,
          offset: point.offset,
          type: point.type,
        });
      });
    },

    hasNonCollapsedSelection() {
      return editor.getEditorState().read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) && !selection.isCollapsed();
      });
    },

    undo() {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    },

    redo() {
      editor.dispatchCommand(REDO_COMMAND, undefined);
    },

    isEditable() {
      return editor.isEditable();
    },
  };

  /** Shared implementation for dd/yy/cc/dj/dG… over a computed block range. */
  function runLineOp(
    op: LineOpKind,
    range: (blocks: ElementNode[], currentIdx: number) => [number, number]
  ): RegisterContent | null {
    let content: RegisterContent | null = null;
    update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const current = $leafBlockOf(selection.focus);
      if (!current) return;
      const blocks = $leafBlocks();
      const idx = blocks.findIndex((b) => b.is(current));
      if (idx === -1) return;
      const [s, e] = range(blocks, idx);
      content = $applyLineOpToBlocks(op, blocks.slice(s, e + 1));
    });
    return content;
  }

  /** Build nodes for a line-register paste, matching the paste context. */
  function buildRegisterNodes(
    content: RegisterContent,
    context: ElementNode
  ): LexicalNode[] {
    // Rich nodes only re-import cleanly at the root level; inside lists or
    // cells we fall back to plain text so the schema stays valid.
    if (content.nodes && $isRootNode(context.getParent())) {
      try {
        return content.nodes.map((n) =>
          $parseSerializedNode(n as SerializedLexicalNode)
        );
      } catch {
        // fall through to plain text
      }
    }
    if ($isListItemNode(context)) {
      return content.text.split('\n').map((line) => {
        const item = $createListItemNode();
        if (line) item.append($createTextNode(line));
        return item;
      });
    }
    return $paragraphsFromText(content.text);
  }

  return adapter;
}

/** Apply a line-wise operator to an explicit list of leaf blocks. */
function $applyLineOpToBlocks(
  op: LineOpKind,
  blocks: ElementNode[]
): RegisterContent | null {
  if (blocks.length === 0) return null;
  const content = $yankBlocks(blocks);

  if (op === 'yank') {
    const first = blocks[0];
    if (first) {
      const flat = $flattenBlock(first);
      $setCollapsedSelection(pointForFlat(flat, 0));
    }
    return content;
  }

  if (op === 'change') {
    // Clear the first block in place (preserving its type/position) and
    // remove the rest; leaves the cursor in the emptied line.
    const first = blocks[0];
    if (!first) return content;
    for (const child of first.getChildren()) child.remove();
    for (const block of blocks.slice(1)) {
      $removeBlockAndEmptyAncestors(block);
    }
    first.select(0, 0);
    return content;
  }

  // delete
  const all = $leafBlocks();
  const lastIdx = all.findIndex((b) => b.is(blocks[blocks.length - 1]));
  const following = lastIdx >= 0 ? all[lastIdx + 1] : undefined;
  const firstIdx = all.findIndex((b) => b.is(blocks[0]));
  const preceding = firstIdx > 0 ? all[firstIdx - 1] : undefined;

  for (const block of blocks) {
    $removeBlockAndEmptyAncestors(block);
  }
  const fresh = $ensureNonEmptyRoot();
  const landing = following?.isAttached()
    ? following
    : preceding?.isAttached()
      ? preceding
      : (fresh ?? undefined);
  if (landing && $isElementNode(landing)) {
    const flat = $flattenBlock(landing);
    $setCollapsedSelection(pointForFlat(flat, 0));
  }
  return content;
}
