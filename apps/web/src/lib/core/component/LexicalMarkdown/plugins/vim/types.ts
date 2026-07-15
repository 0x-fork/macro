/**
 * @file Shared types for the vim emulation layer.
 *
 * The vim module is split into:
 * - `textMotions.ts`  — pure string scanning (word motions, find-char, text
 *   objects). No Lexical or DOM dependency; unit tested in isolation.
 * - `engine.ts`       — the modal state machine. Translates keystrokes into
 *   semantic commands against a {@link VimAdapter}.
 * - `lexicalVimAdapter.ts` — the Lexical/DOM implementation of the adapter.
 * - `vimPlugin.ts`    — a Lexical plugin wiring the engine into an editor.
 */
import type { LexicalEditor } from 'lexical';

/** Vim editing modes supported by the emulation. */
export type VimMode = 'normal' | 'insert' | 'visual' | 'visual-line';

/**
 * The flattened text of the "line" (leaf block) containing the cursor.
 *
 * Rich content is flattened to a plain string so motions can be computed as
 * pure string scans: inline decorators (mentions, equations, …) become a
 * single object-replacement char, soft line breaks become `\n`.
 */
export type LineContext = {
  /** Flattened text of the whole leaf block. */
  blockText: string;
  /** Cursor offset within {@link blockText}. */
  cursor: number;
  /**
   * Bounds of the soft line (`\n`-delimited segment of the block) containing
   * the cursor: `[lineStart, lineEnd)` — `lineEnd` excludes the newline.
   */
  lineStart: number;
  lineEnd: number;
};

/** What the unnamed register currently holds. */
export type RegisterContent = {
  kind: 'char' | 'line';
  text: string;
  /**
   * Serialized top-level nodes for line-wise yanks of root-level blocks, so
   * `p` can restore rich content (headings, lists) with formatting intact.
   * Absent when the yank source was nested (e.g. list items) — those paste
   * back as plain text lines.
   */
  nodes?: unknown[];
};

/** A normalized keystroke fed to the engine. */
export type VimKeyInput = {
  key: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  shift: boolean;
};

/** Line-wise operator kinds. */
export type LineOpKind = 'delete' | 'yank' | 'change';

/**
 * Everything the vim engine needs from the host editor. Implemented for
 * Lexical by `lexicalVimAdapter.ts`; a plain in-memory fake can implement it
 * for engine tests.
 *
 * All methods are called from event handlers (outside any Lexical update);
 * implementations wrap their own `editor.update()` calls.
 */
export interface VimAdapter {
  readonly editor: LexicalEditor;

  /** Read the flattened line context around the collapsed cursor. */
  readLine(): LineContext | null;

  /** Move the collapsed cursor to a flat offset within the current block. */
  setCursorFlat(offset: number): void;
  /** Extend the selection focus to a flat offset (visual mode motions). */
  selectToFlat(offset: number): void;

  /** Move (or extend) the cursor vertically by visual lines. */
  moveVertical(dir: 1 | -1, count: number, extend: boolean): void;
  /** Move (or extend) to the previous/next block boundary (vim `{` / `}`). */
  moveBlockBoundary(dir: 1 | -1, count: number, extend: boolean): void;
  /** Move (or extend) to the first or last line of the document (gg / G). */
  moveDocEdge(edge: 'start' | 'end', extend: boolean): void;
  /** Place the cursor at the start/end of an adjacent block (w/b spill). */
  moveToAdjacentBlock(dir: 1 | -1, edge: 'start' | 'end'): boolean;

  /** Read flat text without modifying anything (yank). */
  readFlatRange(start: number, end: number): string;
  /** Delete `[start, end)` in the current block; returns the removed text. */
  deleteFlatRange(start: number, end: number): string;
  /** Replace `[start, end)` with `text`, cursor left at start of `text`. */
  replaceFlatRange(start: number, end: number, text: string): void;
  /** Toggle the case of `[start, end)` (vim `~`). */
  toggleCaseFlatRange(start: number, end: number): void;

  /** Insert plain text at the collapsed cursor (dot-repeat replay). */
  insertText(text: string): void;
  /** Split the paragraph at the cursor (dot-repeat replay of Enter). */
  insertParagraph(): void;

  /** Open a new line above/below the current one and move into it (o / O). */
  openLine(where: 'above' | 'below'): void;
  /** Join the current line with the following ones (vim `J`). */
  joinLines(count: number): void;
  /** Indent or outdent the current block(s) (>> / <<). */
  indentLines(count: number, dir: 'in' | 'out'): void;

  /**
   * Line-wise operator over blocks `[currentIndex + startDelta,
   * currentIndex + endDelta]` (inclusive). Returns yanked content.
   */
  lineOp(
    op: LineOpKind,
    startDelta: number,
    endDelta: number
  ): RegisterContent | null;
  /** Line-wise operator from the current block to a document edge (dG/dgg). */
  lineOpToEdge(op: LineOpKind, edge: 'start' | 'end'): RegisterContent | null;

  /** Character-wise paste (vim `p`/`P` with a charwise register). */
  pasteChar(text: string, after: boolean, count: number): void;
  /** Line-wise paste below/above the current block. */
  pasteLine(content: RegisterContent, after: boolean, count: number): void;

  /**
   * Apply an operator to the active (visual) selection. The adapter extends
   * the selection one character forward first when it is not backward, to
   * match vim's inclusive visual ranges. Returns yanked content.
   */
  visualOp(op: LineOpKind, linewise: boolean): RegisterContent | null;
  /** Replace the visual selection with register content. */
  visualPaste(content: RegisterContent): void;
  /** Indent/outdent all blocks touched by the visual selection. */
  visualIndent(dir: 'in' | 'out', count: number): void;
  /** Toggle case across the visual selection. */
  visualToggleCase(): void;
  /** Swap the anchor and focus of the visual selection (vim `o`). */
  visualSwapEnds(): void;
  /** Expand the selection to whole lines (visual-line mode display). */
  expandSelectionToLines(): void;
  /** Collapse the selection to its start or focus point. */
  collapseSelection(to: 'start' | 'focus'): void;
  /** True when the DOM selection within this editor is non-collapsed. */
  hasNonCollapsedSelection(): boolean;

  undo(): void;
  redo(): void;

  /** Whether the editor currently accepts edits. */
  isEditable(): boolean;
}
