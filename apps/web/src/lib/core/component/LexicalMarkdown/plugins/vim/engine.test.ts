import { beforeEach, describe, expect, it } from 'vitest';
import { VimEngine } from './engine';
import type {
  LineContext,
  LineOpKind,
  RegisterContent,
  VimAdapter,
} from './types';
import { getRegister, setRegister } from './vimSignals';

/**
 * An in-memory VimAdapter over a plain string[] buffer — one block per line,
 * no soft breaks. Selections are tracked as (line, col) pairs so visual-mode
 * behavior can be asserted without a DOM.
 */
class FakeAdapter implements VimAdapter {
  editor = {} as VimAdapter['editor'];

  lines: string[];
  line = 0;
  col = 0;
  /** Visual selection anchor; null when collapsed. */
  anchor: { line: number; col: number } | null = null;
  undoCount = 0;
  redoCount = 0;
  indentCalls: Array<{ count: number; dir: 'in' | 'out' }> = [];

  constructor(lines: string[]) {
    this.lines = [...lines];
  }

  get text() {
    return this.lines.join('\n');
  }

  private clampLine(n: number) {
    return Math.max(0, Math.min(this.lines.length - 1, n));
  }

  readLine(): LineContext | null {
    const text = this.lines[this.line] ?? '';
    return {
      blockText: text,
      cursor: this.col,
      lineStart: 0,
      lineEnd: text.length,
    };
  }

  setCursorFlat(offset: number) {
    this.col = offset;
    this.anchor = null;
  }

  selectToFlat(offset: number) {
    this.anchor ??= { line: this.line, col: this.col };
    this.col = offset;
  }

  moveVertical(dir: 1 | -1, count: number, extend: boolean) {
    if (extend) this.anchor ??= { line: this.line, col: this.col };
    else this.anchor = null;
    this.line = this.clampLine(this.line + dir * count);
    this.col = Math.min(this.col, (this.lines[this.line] ?? '').length);
  }

  moveBlockBoundary(dir: 1 | -1, count: number, extend: boolean) {
    this.moveVertical(dir, count, extend);
  }

  moveDocEdge(edge: 'start' | 'end', extend: boolean) {
    if (extend) this.anchor ??= { line: this.line, col: this.col };
    else this.anchor = null;
    this.line = edge === 'start' ? 0 : this.lines.length - 1;
    this.col = 0;
  }

  moveToAdjacentBlock(dir: 1 | -1, edge: 'start' | 'end') {
    const target = this.line + dir;
    if (target < 0 || target >= this.lines.length) return false;
    this.line = target;
    const text = this.lines[this.line] ?? '';
    this.col = edge === 'start' ? 0 : Math.max(0, text.length - 1);
    return true;
  }

  readFlatRange(start: number, end: number) {
    return (this.lines[this.line] ?? '').slice(start, end);
  }

  deleteFlatRange(start: number, end: number) {
    const text = this.lines[this.line] ?? '';
    const removed = text.slice(start, end);
    this.lines[this.line] = text.slice(0, start) + text.slice(end);
    this.col = start;
    return removed;
  }

  replaceFlatRange(start: number, end: number, replacement: string) {
    const text = this.lines[this.line] ?? '';
    this.lines[this.line] =
      text.slice(0, start) + replacement + text.slice(end);
    this.col = start + replacement.length;
  }

  toggleCaseFlatRange(start: number, end: number) {
    const text = this.lines[this.line] ?? '';
    const toggled = text
      .slice(start, end)
      .replace(/./g, (ch) =>
        ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()
      );
    this.lines[this.line] = text.slice(0, start) + toggled + text.slice(end);
  }

  insertText(text: string) {
    const line = this.lines[this.line] ?? '';
    this.lines[this.line] =
      line.slice(0, this.col) + text + line.slice(this.col);
    this.col += text.length;
  }

  insertParagraph() {
    const line = this.lines[this.line] ?? '';
    const before = line.slice(0, this.col);
    const after = line.slice(this.col);
    this.lines.splice(this.line, 1, before, after);
    this.line++;
    this.col = 0;
  }

  openLine(where: 'above' | 'below') {
    const at = where === 'below' ? this.line + 1 : this.line;
    this.lines.splice(at, 0, '');
    this.line = at;
    this.col = 0;
  }

  joinLines(count: number) {
    for (let i = 0; i < count; i++) {
      if (this.line + 1 >= this.lines.length) return;
      const current = this.lines[this.line] ?? '';
      const next = (this.lines[this.line + 1] ?? '').replace(/^[ \t]+/, '');
      this.col = current.length;
      this.lines.splice(
        this.line,
        2,
        current + (current && next ? ' ' : '') + next
      );
    }
  }

  indentLines(count: number, dir: 'in' | 'out') {
    this.indentCalls.push({ count, dir });
  }

  lineOp(op: LineOpKind, startDelta: number, endDelta: number) {
    const s = this.clampLine(this.line + startDelta);
    const e = this.clampLine(this.line + endDelta);
    return this.applyLineOp(op, s, e);
  }

  lineOpToEdge(op: LineOpKind, edge: 'start' | 'end') {
    return edge === 'start'
      ? this.applyLineOp(op, 0, this.line)
      : this.applyLineOp(op, this.line, this.lines.length - 1);
  }

  private applyLineOp(op: LineOpKind, s: number, e: number) {
    const slice = this.lines.slice(s, e + 1);
    const content: RegisterContent = { kind: 'line', text: slice.join('\n') };
    if (op === 'yank') {
      this.line = s;
      this.col = 0;
      return content;
    }
    if (op === 'change') {
      this.lines.splice(s, e - s + 1, '');
      this.line = s;
      this.col = 0;
      return content;
    }
    this.lines.splice(s, e - s + 1);
    if (this.lines.length === 0) this.lines = [''];
    this.line = this.clampLine(s);
    this.col = 0;
    return content;
  }

  pasteChar(text: string, after: boolean, count: number) {
    const line = this.lines[this.line] ?? '';
    const at = after && this.col < line.length ? this.col + 1 : this.col;
    const payload = text.repeat(count);
    this.lines[this.line] = line.slice(0, at) + payload + line.slice(at);
    this.col = at + payload.length - 1;
  }

  pasteLine(content: RegisterContent, after: boolean, count: number) {
    const at = after ? this.line + 1 : this.line;
    const inserted: string[] = [];
    for (let i = 0; i < count; i++) inserted.push(...content.text.split('\n'));
    this.lines.splice(at, 0, ...inserted);
    this.line = at;
    this.col = 0;
  }

  private orderedSelection() {
    const anchor = this.anchor ?? { line: this.line, col: this.col };
    const focus = { line: this.line, col: this.col };
    const backward =
      focus.line < anchor.line ||
      (focus.line === anchor.line && focus.col < anchor.col);
    return backward
      ? { start: focus, end: anchor }
      : { start: anchor, end: focus };
  }

  visualOp(op: LineOpKind, linewise: boolean) {
    const { start, end } = this.orderedSelection();
    if (linewise) {
      const content = this.applyLineOp(
        op === 'yank' ? 'yank' : op,
        start.line,
        end.line
      );
      this.anchor = null;
      return content;
    }
    // Single-line charwise is all the tests need.
    const text = this.lines[start.line] ?? '';
    const endCol = Math.min(text.length, end.col + 1);
    const selected = text.slice(start.col, endCol);
    if (op !== 'yank') {
      this.lines[start.line] = text.slice(0, start.col) + text.slice(endCol);
    }
    this.line = start.line;
    this.col = start.col;
    this.anchor = null;
    return { kind: 'char', text: selected } as RegisterContent;
  }

  visualPaste(content: RegisterContent) {
    const { start, end } = this.orderedSelection();
    const text = this.lines[start.line] ?? '';
    const endCol = Math.min(text.length, end.col + 1);
    this.lines[start.line] =
      text.slice(0, start.col) + content.text + text.slice(endCol);
    this.line = start.line;
    this.col = start.col;
    this.anchor = null;
  }

  visualIndent(dir: 'in' | 'out', count: number) {
    this.indentCalls.push({ count, dir });
    this.anchor = null;
  }

  visualToggleCase() {
    const { start, end } = this.orderedSelection();
    this.toggleCaseFlatRange(start.col, end.col + 1);
    this.col = start.col;
    this.anchor = null;
  }

  visualSwapEnds() {
    if (!this.anchor) return;
    const anchor = this.anchor;
    this.anchor = { line: this.line, col: this.col };
    this.line = anchor.line;
    this.col = anchor.col;
  }

  expandSelectionToLines() {
    // Line granularity is implicit in the fake (one block per line).
  }

  collapseSelection() {
    this.anchor = null;
  }

  hasNonCollapsedSelection() {
    return this.anchor !== null;
  }

  undo() {
    this.undoCount++;
  }

  redo() {
    this.redoCount++;
  }

  isEditable() {
    return true;
  }
}

function key(k: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: () => {},
    stopPropagation: () => {},
    ...mods,
  } as KeyboardEvent;
}

/**
 * Type a sequence of printable keys through the engine. In insert mode the
 * engine passes printable keys through (the browser performs the insertion),
 * so the fake "browser" applies them to the buffer here.
 */
function typeInto(adapter: FakeAdapter, engine: VimEngine, keys: string) {
  for (const k of keys) {
    if (engine.mode === 'insert') {
      const consumed = engine.handleInsertKey(key(k));
      if (!consumed) adapter.insertText(k);
    } else {
      engine.handleNormalKey(key(k));
    }
  }
}

function esc(engine: VimEngine) {
  if (engine.mode === 'insert') engine.handleInsertKey(key('Escape'));
  else engine.handleNormalKey(key('Escape'));
}

describe('VimEngine', () => {
  let adapter: FakeAdapter;
  let engine: VimEngine;

  const setup = (lines: string[], line = 0, col = 0) => {
    adapter = new FakeAdapter(lines);
    adapter.line = line;
    adapter.col = col;
    engine = new VimEngine(adapter);
  };

  beforeEach(() => {
    setRegister({ kind: 'char', text: '' });
  });

  describe('motions', () => {
    it('h and l move with counts and clamp to the line', () => {
      setup(['hello world'], 0, 0);
      typeInto(adapter, engine, '3l');
      expect(adapter.col).toBe(3);
      typeInto(adapter, engine, '99l');
      expect(adapter.col).toBe(10); // clamped to last char
      typeInto(adapter, engine, '2h');
      expect(adapter.col).toBe(8);
    });

    it('0, ^ and $ move within the line', () => {
      setup(['   indented line'], 0, 5);
      typeInto(adapter, engine, '0');
      expect(adapter.col).toBe(0);
      typeInto(adapter, engine, '^');
      expect(adapter.col).toBe(3);
      typeInto(adapter, engine, '$');
      expect(adapter.col).toBe(15); // on the last char
    });

    it('w, e and b use vim word semantics', () => {
      setup(['foo bar-baz qux'], 0, 0);
      typeInto(adapter, engine, 'w');
      expect(adapter.col).toBe(4);
      typeInto(adapter, engine, 'w');
      expect(adapter.col).toBe(7); // the '-' punctuation run
      typeInto(adapter, engine, 'e');
      expect(adapter.col).toBe(10); // end of baz
      typeInto(adapter, engine, 'b');
      expect(adapter.col).toBe(8); // start of baz
    });

    it('w at end of line spills to the next block', () => {
      setup(['foo', 'bar'], 0, 2);
      typeInto(adapter, engine, 'w');
      expect(adapter.line).toBe(1);
      expect(adapter.col).toBe(0);
    });

    it('j and k move vertically with counts', () => {
      setup(['a', 'b', 'c', 'd'], 0, 0);
      typeInto(adapter, engine, '2j');
      expect(adapter.line).toBe(2);
      typeInto(adapter, engine, 'k');
      expect(adapter.line).toBe(1);
    });

    it('gg and G go to the document edges', () => {
      setup(['first', 'mid', '  last'], 1, 2);
      typeInto(adapter, engine, 'G');
      expect(adapter.line).toBe(2);
      expect(adapter.col).toBe(2); // first non-blank
      typeInto(adapter, engine, 'gg');
      expect(adapter.line).toBe(0);
      expect(adapter.col).toBe(0);
    });

    it('f/t find characters; ; and , repeat', () => {
      setup(['abcabcabc'], 0, 0);
      typeInto(adapter, engine, 'fb');
      expect(adapter.col).toBe(1);
      typeInto(adapter, engine, ';');
      expect(adapter.col).toBe(4);
      typeInto(adapter, engine, ',');
      expect(adapter.col).toBe(1);
      typeInto(adapter, engine, 'tc');
      expect(adapter.col).toBe(1); // parked before c at 2 — already there
      typeInto(adapter, engine, ';');
      expect(adapter.col).toBe(4); // repeat skips the adjacent target
    });

    it('% jumps to the matching bracket', () => {
      setup(['call(foo(bar))'], 0, 0);
      typeInto(adapter, engine, '%');
      expect(adapter.col).toBe(13);
    });
  });

  describe('operators', () => {
    it('dw deletes a word into the register', () => {
      setup(['foo bar baz'], 0, 0);
      typeInto(adapter, engine, 'dw');
      expect(adapter.text).toBe('bar baz');
      expect(getRegister()?.text).toBe('foo ');
    });

    it('d$ (and D) delete to end of line', () => {
      setup(['foo bar', 'x'], 0, 3);
      typeInto(adapter, engine, 'd$');
      expect(adapter.lines[0]).toBe('foo');
      setup(['foo bar', 'x'], 0, 3);
      typeInto(adapter, engine, 'D');
      expect(adapter.lines[0]).toBe('foo');
    });

    it('cw acts like ce on a word (vim quirk)', () => {
      setup(['hello world'], 0, 0);
      typeInto(adapter, engine, 'cw');
      expect(engine.mode).toBe('insert');
      expect(adapter.text).toBe(' world');
      typeInto(adapter, engine, 'bye');
      esc(engine);
      expect(adapter.text).toBe('bye world');
    });

    it('dd deletes lines with counts (2dd)', () => {
      setup(['one', 'two', 'three'], 0, 0);
      typeInto(adapter, engine, '2dd');
      expect(adapter.lines).toEqual(['three']);
      expect(getRegister()).toMatchObject({ kind: 'line', text: 'one\ntwo' });
    });

    it('dj deletes the current and next line', () => {
      setup(['one', 'two', 'three'], 0, 0);
      typeInto(adapter, engine, 'dj');
      expect(adapter.lines).toEqual(['three']);
    });

    it('yy then p pastes the line below', () => {
      setup(['alpha', 'beta'], 0, 0);
      typeInto(adapter, engine, 'yyp');
      expect(adapter.lines).toEqual(['alpha', 'alpha', 'beta']);
    });

    it('diw and daw operate on the word under the cursor', () => {
      setup(['foo bar baz'], 0, 5);
      typeInto(adapter, engine, 'diw');
      expect(adapter.text).toBe('foo  baz');
      setup(['foo bar baz'], 0, 5);
      typeInto(adapter, engine, 'daw');
      expect(adapter.text).toBe('foo baz');
    });

    it('ci" changes inside quotes', () => {
      setup(['say "hello" now'], 0, 6);
      typeInto(adapter, engine, 'ci"');
      expect(engine.mode).toBe('insert');
      typeInto(adapter, engine, 'bye');
      esc(engine);
      expect(adapter.text).toBe('say "bye" now');
    });

    it('di( deletes inside brackets', () => {
      setup(['fn(arg one, two)'], 0, 5);
      typeInto(adapter, engine, 'di(');
      expect(adapter.text).toBe('fn()');
    });

    it('dG deletes to the end of the document', () => {
      setup(['one', 'two', 'three'], 1, 0);
      typeInto(adapter, engine, 'dG');
      expect(adapter.lines).toEqual(['one']);
    });

    it('2d3w multiplies counts', () => {
      setup(['a b c d e f g h'], 0, 0);
      typeInto(adapter, engine, '2d3w');
      expect(adapter.text).toBe('g h');
    });

    it('>> indents and << outdents', () => {
      setup(['line'], 0, 0);
      typeInto(adapter, engine, '>>');
      expect(adapter.indentCalls).toEqual([{ count: 1, dir: 'in' }]);
      typeInto(adapter, engine, '3<<');
      expect(adapter.indentCalls[1]).toEqual({ count: 3, dir: 'out' });
    });
  });

  describe('standalone edits', () => {
    it('x deletes chars forward; X backward', () => {
      setup(['abcdef'], 0, 2);
      typeInto(adapter, engine, '2x');
      expect(adapter.text).toBe('abef');
      typeInto(adapter, engine, 'X');
      expect(adapter.text).toBe('aef');
    });

    it('x clamps the cursor when deleting the last char', () => {
      setup(['ab'], 0, 1);
      typeInto(adapter, engine, 'x');
      expect(adapter.text).toBe('a');
      expect(adapter.col).toBe(0);
    });

    it('r replaces characters in place', () => {
      setup(['abc'], 0, 0);
      typeInto(adapter, engine, 'rx');
      expect(adapter.text).toBe('xbc');
      expect(adapter.col).toBe(0);
      typeInto(adapter, engine, '2rz');
      expect(adapter.text).toBe('zzc');
      expect(adapter.col).toBe(1);
    });

    it('r refuses when not enough chars remain', () => {
      setup(['ab'], 0, 1);
      typeInto(adapter, engine, '3rz');
      expect(adapter.text).toBe('ab');
    });

    it('~ toggles case and advances', () => {
      setup(['aBc'], 0, 0);
      typeInto(adapter, engine, '2~');
      expect(adapter.text).toBe('Abc');
      expect(adapter.col).toBe(2);
    });

    it('J joins lines with vim spacing', () => {
      setup(['foo', '   bar'], 0, 0);
      typeInto(adapter, engine, 'J');
      expect(adapter.lines).toEqual(['foo bar']);
      expect(adapter.col).toBe(3);
    });

    it('s substitutes chars and enters insert', () => {
      setup(['abc'], 0, 0);
      typeInto(adapter, engine, '2s');
      expect(engine.mode).toBe('insert');
      expect(adapter.text).toBe('c');
    });

    it('u undoes and ctrl-r redoes with counts', () => {
      setup(['x'], 0, 0);
      typeInto(adapter, engine, '3u');
      expect(adapter.undoCount).toBe(3);
      engine.handleNormalKey(key('r', { ctrlKey: true }));
      expect(adapter.redoCount).toBe(1);
    });

    it('p pastes charwise text after the cursor', () => {
      setup(['abc'], 0, 0);
      setRegister({ kind: 'char', text: 'XY' });
      typeInto(adapter, engine, 'p');
      expect(adapter.text).toBe('aXYbc');
      expect(adapter.col).toBe(2); // on the last pasted char
    });
  });

  describe('insert transitions', () => {
    it('i / a / I / A position the cursor before entering insert', () => {
      setup(['  word'], 0, 3);
      typeInto(adapter, engine, 'a');
      expect(engine.mode).toBe('insert');
      expect(adapter.col).toBe(4);
      esc(engine);
      expect(engine.mode).toBe('normal');
      expect(adapter.col).toBe(3); // escape steps back one

      typeInto(adapter, engine, 'A');
      expect(adapter.col).toBe(6);
      esc(engine);
      typeInto(adapter, engine, 'I');
      expect(adapter.col).toBe(2);
      esc(engine);
    });

    it('o opens below, O above', () => {
      setup(['one', 'two'], 0, 1);
      typeInto(adapter, engine, 'o');
      expect(engine.mode).toBe('insert');
      expect(adapter.lines).toEqual(['one', '', 'two']);
      expect(adapter.line).toBe(1);
      esc(engine);
      typeInto(adapter, engine, 'O');
      expect(adapter.lines).toEqual(['one', '', '', 'two']);
    });

    it('typed text lands in the buffer through insert mode', () => {
      setup([''], 0, 0);
      typeInto(adapter, engine, 'i');
      typeInto(adapter, engine, 'hi');
      esc(engine);
      expect(adapter.text).toBe('hi');
    });
  });

  describe('visual mode', () => {
    it('v + motion + d deletes the inclusive selection', () => {
      setup(['abcdef'], 0, 1);
      typeInto(adapter, engine, 'v2ld');
      expect(adapter.text).toBe('aef');
      expect(engine.mode).toBe('normal');
    });

    it('v + y yanks and collapses', () => {
      setup(['abcdef'], 0, 0);
      typeInto(adapter, engine, 'vlly');
      expect(getRegister()?.text).toBe('abc');
      expect(engine.mode).toBe('normal');
    });

    it('V selects lines; d removes them', () => {
      setup(['one', 'two', 'three'], 0, 0);
      typeInto(adapter, engine, 'Vjd');
      expect(adapter.lines).toEqual(['three']);
      expect(engine.mode).toBe('normal');
    });

    it('o swaps the selection ends', () => {
      setup(['abcdef'], 0, 1);
      typeInto(adapter, engine, 'v3l');
      expect(adapter.col).toBe(4);
      typeInto(adapter, engine, 'o');
      expect(adapter.col).toBe(1);
    });

    it('Escape leaves visual mode', () => {
      setup(['abc'], 0, 0);
      typeInto(adapter, engine, 'vl');
      expect(engine.mode).toBe('visual');
      esc(engine);
      expect(engine.mode).toBe('normal');
    });
  });

  describe('dot repeat', () => {
    it('repeats a simple delete', () => {
      setup(['aaaa bbbb cccc'], 0, 0);
      typeInto(adapter, engine, 'dw');
      expect(adapter.text).toBe('bbbb cccc');
      typeInto(adapter, engine, '.');
      expect(adapter.text).toBe('cccc');
    });

    it('repeats x with its count', () => {
      setup(['abcdefgh'], 0, 0);
      typeInto(adapter, engine, '2x');
      typeInto(adapter, engine, '.');
      expect(adapter.text).toBe('efgh');
    });

    it('repeats an insert-entering change with the typed text', () => {
      setup(['foo bar'], 0, 0);
      typeInto(adapter, engine, 'cw');
      typeInto(adapter, engine, 'qux');
      esc(engine);
      expect(adapter.text).toBe('qux bar');
      // Move to the following word and repeat the change.
      typeInto(adapter, engine, 'w.');
      expect(adapter.text).toBe('qux qux');
    });

    it('repeats o with typed text', () => {
      setup(['start'], 0, 0);
      typeInto(adapter, engine, 'o');
      typeInto(adapter, engine, 'new');
      esc(engine);
      expect(adapter.lines).toEqual(['start', 'new']);
      typeInto(adapter, engine, '.');
      expect(adapter.lines).toEqual(['start', 'new', 'new']);
    });
  });

  describe('pass-through behavior', () => {
    it('does not consume meta shortcuts', () => {
      setup(['abc'], 0, 0);
      expect(engine.handleNormalKey(key('c', { metaKey: true }))).toBe(false);
    });

    it('does not consume Enter in normal mode', () => {
      setup(['abc'], 0, 0);
      expect(engine.handleNormalKey(key('Enter'))).toBe(false);
    });

    it('consumes unknown printable keys (vim beep)', () => {
      setup(['abc'], 0, 0);
      expect(engine.handleNormalKey(key('q'))).toBe(true);
      expect(adapter.text).toBe('abc');
    });

    it('Escape passes through when nothing is pending', () => {
      setup(['abc'], 0, 0);
      expect(engine.handleNormalKey(key('Escape'))).toBe(false);
      // …but clears pending state when there is some.
      typeInto(adapter, engine, 'd');
      expect(engine.handleNormalKey(key('Escape'))).toBe(true);
    });
  });
});
