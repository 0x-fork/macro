/**
 * @file The vim modal state machine.
 *
 * One engine instance exists per editor. It consumes normalized keystrokes
 * (from `vimPlugin.ts`), tracks mode / counts / pending operators, resolves
 * motions with the pure scanners in `textMotions.ts`, and effects everything
 * through a {@link VimAdapter}.
 *
 * Supported (see keymap below): normal/insert/visual/visual-line modes;
 * counts; motions h j k l 0 ^ $ | w W b B e E f F t T ; , { } % gg G;
 * operators d c y > < with motions, doubled (dd/yy/cc/>>/<<) and text
 * objects (i/a + w W " ' ` ( ) [ ] { } < > b B p); x X s S D C Y r ~ J
 * i a I A o O p P u ⌃r v V and `.` repeat with insert replay.
 */
import {
  bracketObject,
  clamp,
  findCharInLine,
  firstNonBlank,
  matchBracket,
  nextWordStart,
  prevWordStart,
  quoteObject,
  wordEnd,
  wordObject,
} from './textMotions';
import type { LineContext, LineOpKind, VimAdapter, VimMode } from './types';
import { getRegister, setRegister, setVimStatus } from './vimSignals';

type Operator = 'd' | 'c' | 'y' | '>' | '<';

type PendingChar =
  | { kind: 'f' | 'F' | 't' | 'T' }
  | { kind: 'r' }
  | { kind: 'object'; around: boolean };

/** A resolved character-wise motion within the current block. */
type CharMotionResult = {
  /** Where the cursor lands for a plain (non-operator) motion. */
  moveTo: number;
  /** Operator range `[start, end)`. */
  opStart: number;
  opEnd: number;
};

/**
 * The last change as a canonical key sequence for `.` (e.g. "2dw", "cit" —
 * insert-entering changes carry the typed text separately). Module-level,
 * like the unnamed register, so the repeat travels across editors.
 */
let lastChange: { keys: string; insertedText: string } | null = null;

const OPERATORS = new Set(['d', 'c', 'y', '>', '<']);
const TEXT_OBJECT_TARGETS = new Set([
  'w',
  'W',
  '"',
  "'",
  '`',
  '(',
  ')',
  'b',
  '[',
  ']',
  '{',
  '}',
  'B',
  '<',
  '>',
  'p',
]);

export class VimEngine {
  private adapter: VimAdapter;

  mode: VimMode = 'normal';

  /** Count typed so far (0 = none). */
  private count = 0;
  /** Count typed before the pending operator (`2d3w` → 2). */
  private opCount = 0;
  private operator: Operator | null = null;
  private pendingChar: PendingChar | null = null;
  private gPending = false;
  private lastFind: { kind: 'f' | 'F' | 't' | 'T'; char: string } | null = null;

  /** Chars typed during an insert session that is part of a change. */
  private insertCapture: string[] | null = null;
  private replaying = false;

  constructor(adapter: VimAdapter) {
    this.adapter = adapter;
  }

  // ——————————————————————————————————————————— status plumbing

  private clearPending() {
    this.count = 0;
    this.opCount = 0;
    this.operator = null;
    this.pendingChar = null;
    this.gPending = false;
    this.publishStatus();
  }

  /** Push mode + pending keys to the shared status store. */
  publishStatus() {
    setVimStatus({
      mode: this.mode,
      pending: this.pendingDisplay(),
    });
  }

  private pendingDisplay(): string {
    let out = '';
    if (this.opCount > 0) out += String(this.opCount);
    if (this.operator) out += this.operator;
    if (this.count > 0) out += String(this.count);
    if (this.gPending) out += 'g';
    if (this.pendingChar) {
      if (this.pendingChar.kind === 'object') {
        out += this.pendingChar.around ? 'a' : 'i';
      } else {
        out += this.pendingChar.kind;
      }
    }
    return out;
  }

  private setMode(mode: VimMode) {
    this.mode = mode;
    this.publishStatus();
  }

  /** Total count for an operator+motion combo (`2d3w` = 6). */
  private totalCount(): number {
    return (this.opCount || 1) * (this.count || 1);
  }

  /** Canonical prefix of the in-flight command, for dot-repeat records. */
  private countPrefix(): string {
    let out = '';
    if (this.opCount > 0) out += String(this.opCount);
    if (this.operator) out += this.operator;
    if (this.count > 0) out += String(this.count);
    return out;
  }

  private get inVisual() {
    return this.mode === 'visual' || this.mode === 'visual-line';
  }

  /** Record a completed (non-insert) change for `.`. */
  private recordChange(keys: string) {
    if (this.replaying || this.inVisual) return;
    lastChange = { keys, insertedText: '' };
  }

  // ——————————————————————————————————————————— key entry points

  /**
   * Handle a keydown while in insert mode. Returns true when the event was
   * consumed (only Escape leaves insert mode).
   */
  handleInsertKey(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.exitInsert();
      return true;
    }
    if (this.insertCapture) {
      if (e.key === 'Backspace') this.insertCapture.pop();
      else if (e.key === 'Enter') this.insertCapture.push('\n');
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        this.insertCapture.push(e.key);
      }
    }
    return false;
  }

  private exitInsert() {
    if (this.insertCapture && lastChange) {
      lastChange.insertedText = this.insertCapture.join('');
    }
    this.insertCapture = null;
    this.setMode('normal');
    // vim moves the cursor one left when leaving insert (not past line start).
    const line = this.adapter.readLine();
    if (line && line.cursor > line.lineStart) {
      this.adapter.setCursorFlat(line.cursor - 1);
    }
    this.clearPending();
  }

  /** Handle a keydown in normal/visual mode. Returns true when consumed. */
  handleNormalKey(e: KeyboardEvent): boolean {
    // Meta'd keys are app/browser shortcuts — never vim's.
    if (e.metaKey) return false;

    if (e.ctrlKey) {
      switch (e.key) {
        case 'r':
          if (this.mode !== 'normal') return false;
          for (let i = 0; i < (this.count || 1); i++) this.adapter.redo();
          this.clearPending();
          return true;
        case 'd':
        case 'u': {
          const dir = e.key === 'd' ? 1 : -1;
          this.adapter.moveVertical(dir, 10, this.inVisual);
          this.afterVisualMotion();
          this.clearPending();
          return true;
        }
        default:
          return false;
      }
    }
    if (e.altKey) return false;

    switch (e.key) {
      case 'Escape':
        if (this.inVisual) {
          this.adapter.collapseSelection('focus');
          this.setMode('normal');
          this.clearPending();
          return true;
        }
        if (
          this.operator ||
          this.count > 0 ||
          this.pendingChar ||
          this.gPending
        ) {
          this.clearPending();
          return true;
        }
        // Nothing pending: let the app handle Escape (blur, close panel …).
        return false;
      case 'Backspace':
        this.feedChar('h');
        return true;
      case 'Delete':
        this.feedChar('x');
        return true;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        // Shift+arrows keep native selection semantics (the resulting
        // selection flips us into visual mode via noteExternalSelection).
        if (e.shiftKey) return false;
        const motion = {
          ArrowLeft: 'h',
          ArrowRight: 'l',
          ArrowUp: 'k',
          ArrowDown: 'j',
        }[e.key];
        this.feedChar(motion);
        return true;
      }
      case 'Tab':
        // Swallow: tabIndentationPlugin would edit text from normal mode.
        return true;
      case 'Enter':
        // Pass through — surfaces use Enter to submit (chat, comments).
        return false;
      default:
        break;
    }

    if (e.key.length !== 1) return false;
    this.feedChar(e.key);
    return true;
  }

  // ——————————————————————————————————————————— dispatcher

  /** Feed one printable character into the state machine. */
  feedChar(char: string) {
    this.dispatch(char);
    this.publishStatus();
  }

  private dispatch(char: string) {
    if (this.pendingChar) {
      const pending = this.pendingChar;
      this.pendingChar = null;
      this.resolvePendingChar(pending, char);
      return;
    }

    // Counts (0 is a motion when no count has been started).
    if (/[1-9]/.test(char) || (char === '0' && this.count > 0)) {
      this.count = this.count * 10 + Number(char);
      return;
    }

    if (this.gPending) {
      this.gPending = false;
      if (char === 'g') this.motionDocEdge('start');
      else this.clearPending();
      return;
    }

    if (OPERATORS.has(char)) {
      this.handleOperatorKey(char as Operator);
      return;
    }

    switch (char) {
      // — char motions
      case 'h':
      case 'l':
      case '0':
      case '^':
      case '$':
      case 'w':
      case 'W':
      case 'b':
      case 'B':
      case 'e':
      case 'E':
      case '%':
      case ';':
      case ',':
      case '|':
        this.runCharMotion(char);
        return;
      case ' ':
        this.runCharMotion('l');
        return;
      case 'f':
      case 'F':
      case 't':
      case 'T':
        this.pendingChar = { kind: char };
        return;

      // — line motions
      case 'j':
      case 'k': {
        const dir = char === 'j' ? 1 : -1;
        if (this.operator) {
          this.applyLineOperator(
            dir > 0 ? [0, this.totalCount()] : [-this.totalCount(), 0],
            char
          );
          return;
        }
        this.adapter.moveVertical(dir, this.count || 1, this.inVisual);
        this.afterVisualMotion();
        this.count = 0;
        return;
      }
      case '{':
      case '}': {
        const dir = char === '}' ? 1 : -1;
        if (this.operator) {
          this.applyLineOperator(
            dir > 0 ? [0, this.totalCount()] : [-this.totalCount(), 0],
            char
          );
          return;
        }
        this.adapter.moveBlockBoundary(dir, this.count || 1, this.inVisual);
        this.afterVisualMotion();
        this.count = 0;
        return;
      }
      case 'G':
        this.motionDocEdge('end');
        return;
      case 'g':
        this.gPending = true;
        return;

      // — insert transitions / visual toggles
      case 'i':
      case 'a':
        if (this.operator) {
          this.pendingChar = { kind: 'object', around: char === 'a' };
          return;
        }
        if (this.inVisual) return;
        this.enterInsert(char);
        return;
      case 'I':
      case 'A':
        if (this.operator || this.inVisual) return this.clearPending();
        this.enterInsert(char);
        return;
      case 'o':
        if (this.inVisual) {
          this.adapter.visualSwapEnds();
          return;
        }
        if (this.operator) return this.clearPending();
        this.enterInsert('o');
        return;
      case 'O':
        if (this.operator || this.inVisual) return this.clearPending();
        this.enterInsert('O');
        return;
      case 'v':
        if (this.operator) return this.clearPending();
        if (this.mode === 'visual') {
          this.adapter.collapseSelection('focus');
          this.setMode('normal');
        } else {
          this.setMode('visual');
        }
        return;
      case 'V':
        if (this.operator) return this.clearPending();
        if (this.mode === 'visual-line') {
          this.adapter.collapseSelection('focus');
          this.setMode('normal');
        } else {
          this.setMode('visual-line');
          this.adapter.expandSelectionToLines();
        }
        return;

      // — standalone edits
      case 'x':
        this.commandDeleteChar(true);
        return;
      case 'X':
        this.commandDeleteChar(false);
        return;
      case 's':
        this.commandSubstitute();
        return;
      case 'S':
        if (this.inVisual) {
          this.visualOperator('change', true);
          return;
        }
        this.applyLineOpNow('change', [0, (this.count || 1) - 1]);
        this.enterInsertRaw(`${this.count || ''}S`);
        return;
      case 'D':
        this.commandToLineEnd('delete');
        return;
      case 'C':
        this.commandToLineEnd('change');
        return;
      case 'Y':
        this.applyLineOpNow('yank', [0, (this.count || 1) - 1]);
        this.clearPending();
        return;
      case 'r':
        this.pendingChar = { kind: 'r' };
        return;
      case '~':
        this.commandToggleCase();
        return;
      case 'J':
        this.commandJoin();
        return;
      case 'p':
      case 'P':
        this.commandPaste(char === 'p');
        return;
      case 'u':
        if (this.inVisual) return this.clearPending();
        for (let i = 0; i < (this.count || 1); i++) this.adapter.undo();
        this.clearPending();
        return;
      case '.':
        this.repeatLastChange();
        return;
      default:
        // Unknown key — swallow it (vim beeps) and reset pending state.
        this.clearPending();
        return;
    }
  }

  private handleOperatorKey(op: Operator) {
    if (this.inVisual) {
      switch (op) {
        case 'd':
          this.visualOperator('delete');
          return;
        case 'c':
          this.visualOperator('change');
          return;
        case 'y':
          this.visualOperator('yank');
          return;
        case '>':
        case '<':
          this.adapter.visualIndent(op === '>' ? 'in' : 'out', this.count || 1);
          this.setMode('normal');
          this.clearPending();
          return;
      }
    }
    if (this.operator === op) {
      // Doubled operator = line-wise over count lines (dd / yy / cc / >>).
      const lines = this.totalCount();
      const keys = `${this.countPrefix()}${op}`;
      switch (op) {
        case 'd':
          this.applyLineOpNow('delete', [0, lines - 1]);
          this.recordChange(keys);
          break;
        case 'y':
          this.applyLineOpNow('yank', [0, lines - 1]);
          break;
        case 'c':
          this.applyLineOpNow('change', [0, lines - 1]);
          this.enterInsertRaw(keys);
          return;
        case '>':
        case '<':
          this.adapter.indentLines(lines, op === '>' ? 'in' : 'out');
          this.recordChange(keys);
          break;
      }
      this.clearPending();
      return;
    }
    if (this.operator !== null) {
      // e.g. `dy` — invalid combo.
      this.clearPending();
      return;
    }
    this.operator = op;
    this.opCount = this.count;
    this.count = 0;
  }

  // ——————————————————————————————————————————— motions

  /** Resolve and run a character-wise motion (or apply a pending operator). */
  private runCharMotion(char: string) {
    const line = this.adapter.readLine();
    if (!line) {
      this.clearPending();
      return;
    }
    const motion = this.resolveCharMotion(char, line);
    if (!motion) {
      this.clearPending();
      return;
    }
    if (this.operator) {
      this.applyCharOperator(motion, char);
      return;
    }
    if (this.inVisual) {
      this.adapter.selectToFlat(motion.moveTo);
      this.afterVisualMotion();
    } else {
      this.adapter.setCursorFlat(motion.moveTo);
    }
    this.count = 0;
  }

  /**
   * Compute a char motion against the flattened line. Returns both the
   * plain-move target and the operator range (vim motions differ: `e`, `f`,
   * `%` are inclusive; `$` moves to lineEnd-1 but operates through lineEnd).
   */
  private resolveCharMotion(
    char: string,
    line: LineContext
  ): CharMotionResult | null {
    const { blockText: text, cursor, lineStart, lineEnd } = line;
    const n = this.totalCount();
    const lastCol = Math.max(lineStart, lineEnd - 1);
    /** Exclusive motion: move + operate to the same target. */
    const exclusive = (target: number): CharMotionResult => ({
      moveTo: target,
      opStart: Math.min(cursor, target),
      opEnd: Math.max(cursor, target),
    });
    /** Inclusive motion: operator range extends one past the target. */
    const inclusive = (target: number): CharMotionResult => ({
      moveTo: target,
      opStart: Math.min(cursor, target),
      opEnd: Math.max(cursor, target) + 1,
    });

    switch (char) {
      case 'h':
        return exclusive(Math.max(lineStart, cursor - n));
      case 'l': {
        const cap = this.inVisual || this.operator ? lineEnd : lastCol;
        return exclusive(Math.min(cap, cursor + n));
      }
      case '0':
        return exclusive(lineStart);
      case '^':
        return exclusive(firstNonBlank(text, lineStart, lineEnd));
      case '$': {
        const moveTo = this.inVisual ? lineEnd : lastCol;
        return { moveTo, opStart: cursor, opEnd: lineEnd };
      }
      case '|':
        return exclusive(clamp(lineStart + n - 1, lineStart, lastCol));
      case 'w':
      case 'W': {
        // `cw` acts like `ce` when on a non-blank (vim special case).
        if (this.operator === 'c' && !/[\s]/.test(text[cursor] ?? ' ')) {
          let end = cursor;
          for (let i = 0; i < n; i++) end = wordEnd(text, end, char === 'W');
          return inclusive(end);
        }
        let target = cursor;
        for (let i = 0; i < n; i++) {
          target = nextWordStart(text, target, char === 'W');
        }
        if (target >= text.length && !this.operator && !this.inVisual) {
          // Spill into the next block like vim crosses lines.
          if (this.adapter.moveToAdjacentBlock(1, 'start')) {
            this.count = 0;
            return null;
          }
        }
        return exclusive(
          this.operator || this.inVisual
            ? Math.min(target, text.length)
            : Math.min(target, lastCol)
        );
      }
      case 'e':
      case 'E': {
        let target = cursor;
        for (let i = 0; i < n; i++) {
          target = wordEnd(text, target, char === 'E');
        }
        if (target <= cursor && !this.operator && !this.inVisual) {
          if (this.adapter.moveToAdjacentBlock(1, 'start')) {
            const next = this.adapter.readLine();
            if (next) {
              this.adapter.setCursorFlat(
                wordEnd(
                  next.blockText,
                  Math.max(0, next.cursor - 1),
                  char === 'E'
                )
              );
            }
            this.count = 0;
            return null;
          }
        }
        return inclusive(target);
      }
      case 'b':
      case 'B': {
        let target = cursor;
        for (let i = 0; i < n; i++) {
          target = prevWordStart(text, target, char === 'B');
        }
        if (
          target === cursor &&
          cursor === 0 &&
          !this.operator &&
          !this.inVisual
        ) {
          if (this.adapter.moveToAdjacentBlock(-1, 'end')) {
            const prev = this.adapter.readLine();
            if (prev) {
              this.adapter.setCursorFlat(
                prevWordStart(
                  prev.blockText,
                  prev.blockText.length,
                  char === 'B'
                )
              );
            }
            this.count = 0;
            return null;
          }
        }
        return exclusive(target);
      }
      case '%': {
        const target = matchBracket(text, cursor, lineEnd);
        return target === null ? null : inclusive(target);
      }
      case ';':
      case ',': {
        if (!this.lastFind) return null;
        let { kind } = this.lastFind;
        if (char === ',') {
          kind =
            kind === 'f' ? 'F' : kind === 'F' ? 'f' : kind === 't' ? 'T' : 't';
        }
        const target = findCharInLine(
          text,
          cursor,
          lineStart,
          lineEnd,
          kind,
          this.lastFind.char,
          n,
          true
        );
        if (target === null) return null;
        return kind === 'f' || kind === 't'
          ? inclusive(target)
          : exclusive(target);
      }
      default:
        return null;
    }
  }

  private motionDocEdge(edge: 'start' | 'end') {
    if (this.operator) {
      const op = this.operatorToLineOp();
      const keys = `${this.countPrefix()}${edge === 'start' ? 'gg' : 'G'}`;
      if (op) {
        const content = this.adapter.lineOpToEdge(op, edge);
        setRegister(content);
        if (op === 'change') {
          this.enterInsertRaw(keys);
          return;
        }
        if (op === 'delete') this.recordChange(keys);
      }
      this.clearPending();
      return;
    }
    this.adapter.moveDocEdge(edge, this.inVisual);
    if (this.inVisual) {
      this.afterVisualMotion();
    } else {
      // vim lands on the first non-blank of the target line.
      const line = this.adapter.readLine();
      if (line) {
        this.adapter.setCursorFlat(
          firstNonBlank(line.blockText, line.lineStart, line.lineEnd)
        );
      }
    }
    this.clearPending();
  }

  /** Keep visual-line selections expanded after any motion. */
  private afterVisualMotion() {
    if (this.mode === 'visual-line') {
      this.adapter.expandSelectionToLines();
    }
  }

  // ——————————————————————————————————————————— pending-char resolution

  private resolvePendingChar(pending: PendingChar, char: string) {
    switch (pending.kind) {
      case 'f':
      case 'F':
      case 't':
      case 'T': {
        this.lastFind = { kind: pending.kind, char };
        const line = this.adapter.readLine();
        if (!line) return this.clearPending();
        const target = findCharInLine(
          line.blockText,
          line.cursor,
          line.lineStart,
          line.lineEnd,
          pending.kind,
          char,
          this.totalCount()
        );
        if (target === null) return this.clearPending();
        const forward = pending.kind === 'f' || pending.kind === 't';
        const motion: CharMotionResult = forward
          ? { moveTo: target, opStart: line.cursor, opEnd: target + 1 }
          : { moveTo: target, opStart: target, opEnd: line.cursor };
        if (this.operator) {
          this.applyCharOperator(motion, pending.kind + char);
          return;
        }
        if (this.inVisual) {
          this.adapter.selectToFlat(motion.moveTo);
          this.afterVisualMotion();
        } else {
          this.adapter.setCursorFlat(motion.moveTo);
        }
        this.count = 0;
        return;
      }
      case 'r': {
        this.commandReplaceChar(char);
        return;
      }
      case 'object': {
        this.resolveTextObject(pending.around, char);
        return;
      }
    }
  }

  private resolveTextObject(around: boolean, char: string) {
    if (!this.operator || !TEXT_OBJECT_TARGETS.has(char)) {
      this.clearPending();
      return;
    }
    const objKeys = (around ? 'a' : 'i') + char;

    // ip/ap: line-wise on the current block.
    if (char === 'p') {
      const op = this.operatorToLineOp();
      const keys = `${this.countPrefix()}${objKeys}`;
      if (op) {
        this.applyLineOpNow(op, [0, (this.count || 1) - 1]);
        if (op === 'change') {
          this.enterInsertRaw(keys);
          return;
        }
        if (op === 'delete') this.recordChange(keys);
      }
      this.clearPending();
      return;
    }

    const line = this.adapter.readLine();
    if (!line) return this.clearPending();
    const { blockText: text, cursor, lineStart, lineEnd } = line;

    let range: { start: number; end: number } | null = null;
    if (char === 'w' || char === 'W') {
      range = wordObject(text, cursor, char === 'W', around);
    } else if (char === '"' || char === "'" || char === '`') {
      range = quoteObject(text, cursor, lineStart, lineEnd, char, around);
    } else {
      range = bracketObject(text, cursor, char, around);
    }
    if (!range || range.end <= range.start) {
      this.clearPending();
      return;
    }
    this.applyCharOperator(
      { moveTo: range.start, opStart: range.start, opEnd: range.end },
      objKeys
    );
  }

  // ——————————————————————————————————————————— operators

  private operatorToLineOp(): LineOpKind | null {
    switch (this.operator) {
      case 'd':
        return 'delete';
      case 'c':
        return 'change';
      case 'y':
        return 'yank';
      default:
        return null;
    }
  }

  private applyCharOperator(motion: CharMotionResult, motionKeys: string) {
    const op = this.operator;
    const keys = `${this.countPrefix()}${motionKeys}`;
    this.operator = null;
    const { opStart: start, opEnd: end } = motion;
    switch (op) {
      case 'd': {
        const removed = this.adapter.deleteFlatRange(start, end);
        setRegister({ kind: 'char', text: removed });
        this.clampCursorToLine();
        this.recordChange(keys);
        break;
      }
      case 'c': {
        const removed = this.adapter.deleteFlatRange(start, end);
        setRegister({ kind: 'char', text: removed });
        this.enterInsertRaw(keys);
        return;
      }
      case 'y': {
        const text = this.adapter.readFlatRange(start, end);
        setRegister({ kind: 'char', text });
        this.adapter.setCursorFlat(start);
        break;
      }
      case '>':
      case '<':
        this.adapter.indentLines(1, op === '>' ? 'in' : 'out');
        this.recordChange(keys);
        break;
      default:
        break;
    }
    this.clearPending();
  }

  private applyLineOperator(range: [number, number], motionKey: string) {
    const rawOp = this.operator;
    const op = this.operatorToLineOp();
    const keys = `${this.countPrefix()}${motionKey}`;
    this.operator = null;
    if (!op) {
      // Line-wise indent (>j / <j). Always indents downward from the
      // current line — the upward variants are rare enough to approximate.
      if (rawOp === '>' || rawOp === '<') {
        this.adapter.indentLines(
          Math.abs(range[1] - range[0]) + 1,
          rawOp === '>' ? 'in' : 'out'
        );
        this.recordChange(keys);
      }
      this.clearPending();
      return;
    }
    this.applyLineOpNow(op, range);
    if (op === 'change') {
      this.enterInsertRaw(keys);
      return;
    }
    if (op === 'delete') this.recordChange(keys);
    this.clearPending();
  }

  private applyLineOpNow(op: LineOpKind, [s, e]: [number, number]) {
    const content = this.adapter.lineOp(op, s, e);
    setRegister(content);
  }

  private visualOperator(op: LineOpKind, forceLinewise = false) {
    const linewise = forceLinewise || this.mode === 'visual-line';
    const content = this.adapter.visualOp(op, linewise);
    setRegister(content);
    this.setMode('normal');
    if (op === 'change') {
      this.enterInsertRaw(null);
      return;
    }
    this.clearPending();
  }

  // ——————————————————————————————————————————— standalone commands

  private commandDeleteChar(forward: boolean) {
    if (this.inVisual) {
      this.visualOperator('delete');
      return;
    }
    const line = this.adapter.readLine();
    if (!line) return this.clearPending();
    const n = this.count || 1;
    if (forward) {
      const end = Math.min(line.lineEnd, line.cursor + n);
      if (end > line.cursor) {
        const removed = this.adapter.deleteFlatRange(line.cursor, end);
        setRegister({ kind: 'char', text: removed });
        this.clampCursorToLine();
        this.recordChange(`${this.count || ''}x`);
      }
    } else {
      const start = Math.max(line.lineStart, line.cursor - n);
      if (start < line.cursor) {
        const removed = this.adapter.deleteFlatRange(start, line.cursor);
        setRegister({ kind: 'char', text: removed });
        this.recordChange(`${this.count || ''}X`);
      }
    }
    this.clearPending();
  }

  private commandSubstitute() {
    if (this.inVisual) {
      this.visualOperator('change');
      return;
    }
    const line = this.adapter.readLine();
    if (!line) return this.clearPending();
    const n = this.count || 1;
    const keys = `${this.count || ''}s`;
    const end = Math.min(line.lineEnd, line.cursor + n);
    if (end > line.cursor) {
      const removed = this.adapter.deleteFlatRange(line.cursor, end);
      setRegister({ kind: 'char', text: removed });
    }
    this.enterInsertRaw(keys);
  }

  private commandToLineEnd(op: 'delete' | 'change') {
    if (this.inVisual) {
      this.visualOperator(op, true);
      return;
    }
    const line = this.adapter.readLine();
    if (!line) return this.clearPending();
    const keys = op === 'delete' ? 'D' : 'C';
    if (line.lineEnd > line.cursor) {
      const removed = this.adapter.deleteFlatRange(line.cursor, line.lineEnd);
      setRegister({ kind: 'char', text: removed });
    }
    if (op === 'change') {
      this.enterInsertRaw(keys);
      return;
    }
    this.clampCursorToLine();
    this.recordChange(keys);
    this.clearPending();
  }

  private commandReplaceChar(char: string) {
    if (char.length !== 1) return this.clearPending();
    if (this.inVisual) {
      // Replace every selected char.
      const content = this.adapter.visualOp(
        'yank',
        this.mode === 'visual-line'
      );
      const text = (content?.text ?? '').replace(/[^\n]/g, char);
      this.adapter.visualPaste({ kind: 'char', text });
      this.setMode('normal');
      this.clearPending();
      return;
    }
    const line = this.adapter.readLine();
    if (!line) return this.clearPending();
    const n = this.count || 1;
    if (line.cursor + n > line.lineEnd) {
      // Not enough characters to replace — vim refuses.
      this.clearPending();
      return;
    }
    this.adapter.replaceFlatRange(line.cursor, line.cursor + n, char.repeat(n));
    this.adapter.setCursorFlat(line.cursor + n - 1);
    this.recordChange(`${this.count || ''}r${char}`);
    this.clearPending();
  }

  private commandToggleCase() {
    if (this.inVisual) {
      this.adapter.visualToggleCase();
      this.setMode('normal');
      this.clearPending();
      return;
    }
    const line = this.adapter.readLine();
    if (!line) return this.clearPending();
    const n = this.count || 1;
    const end = Math.min(line.lineEnd, line.cursor + n);
    if (end <= line.cursor) return this.clearPending();
    this.adapter.toggleCaseFlatRange(line.cursor, end);
    this.adapter.setCursorFlat(
      Math.min(end, Math.max(line.lineStart, line.lineEnd - 1))
    );
    this.recordChange(`${this.count || ''}~`);
    this.clearPending();
  }

  private commandJoin() {
    if (this.inVisual) {
      this.adapter.collapseSelection('start');
      this.setMode('normal');
      this.adapter.joinLines(1);
      this.recordChange('J');
      this.clearPending();
      return;
    }
    // 3J joins 3 lines = 2 join operations.
    const joins = Math.max(1, (this.count || 1) - 1);
    this.adapter.joinLines(joins);
    this.recordChange(`${this.count || ''}J`);
    this.clearPending();
  }

  private commandPaste(after: boolean) {
    const reg = getRegister();
    if (!reg) return this.clearPending();
    const keys = `${this.count || ''}${after ? 'p' : 'P'}`;
    if (this.inVisual) {
      this.adapter.visualPaste(reg);
      this.setMode('normal');
    } else if (reg.kind === 'char') {
      this.adapter.pasteChar(reg.text, after, this.count || 1);
      this.recordChange(keys);
    } else {
      this.adapter.pasteLine(reg, after, this.count || 1);
      this.recordChange(keys);
    }
    this.clearPending();
  }

  // ——————————————————————————————————————————— insert transitions

  private enterInsert(command: 'i' | 'a' | 'I' | 'A' | 'o' | 'O') {
    const line = this.adapter.readLine();
    switch (command) {
      case 'i':
        break;
      case 'a':
        if (line && line.cursor < line.lineEnd) {
          this.adapter.setCursorFlat(line.cursor + 1);
        }
        break;
      case 'I':
        if (line) {
          this.adapter.setCursorFlat(
            firstNonBlank(line.blockText, line.lineStart, line.lineEnd)
          );
        }
        break;
      case 'A':
        if (line) this.adapter.setCursorFlat(line.lineEnd);
        break;
      case 'o':
        this.adapter.openLine('below');
        break;
      case 'O':
        this.adapter.openLine('above');
        break;
    }
    this.enterInsertRaw(command);
  }

  /**
   * Switch to insert mode. `keys` is the canonical command that got us here
   * (recorded for `.`), or null when the change should not be repeatable.
   */
  private enterInsertRaw(keys: string | null) {
    this.insertCapture = [];
    if (!this.replaying && keys !== null) {
      lastChange = { keys, insertedText: '' };
    }
    this.operator = null;
    this.count = 0;
    this.opCount = 0;
    this.pendingChar = null;
    this.gPending = false;
    this.setMode('insert');
  }

  // ——————————————————————————————————————————— dot repeat

  private repeatLastChange() {
    if (!lastChange || this.replaying) {
      this.clearPending();
      return;
    }
    const change = lastChange;
    this.replaying = true;
    try {
      this.clearPending();
      for (const key of change.keys) {
        this.dispatch(key);
      }
      if (this.mode === 'insert') {
        // Replay the typed text, then leave insert like Escape would.
        this.replayInsertText(change.insertedText);
        this.insertCapture = null;
        this.setMode('normal');
        const line = this.adapter.readLine();
        if (line && line.cursor > line.lineStart) {
          this.adapter.setCursorFlat(line.cursor - 1);
        }
      }
    } finally {
      this.replaying = false;
      this.clearPending();
    }
  }

  private replayInsertText(text: string) {
    if (!text) return;
    let buffer = '';
    for (const ch of text) {
      if (ch === '\n') {
        if (buffer) {
          this.adapter.insertText(buffer);
          buffer = '';
        }
        this.adapter.insertParagraph();
      } else {
        buffer += ch;
      }
    }
    if (buffer) this.adapter.insertText(buffer);
  }

  // ——————————————————————————————————————————— helpers

  /** vim forbids the normal-mode cursor from resting past the last char. */
  private clampCursorToLine() {
    const line = this.adapter.readLine();
    if (!line) return;
    if (line.cursor >= line.lineEnd && line.lineEnd > line.lineStart) {
      this.adapter.setCursorFlat(line.lineEnd - 1);
    }
  }

  /** Called when the editor loses focus or vim mode is toggled off. */
  reset() {
    this.insertCapture = null;
    this.mode = 'normal';
    this.clearPending();
  }

  /** Sync mode when a selection appears/disappears outside vim (mouse). */
  noteExternalSelection(nonCollapsed: boolean) {
    if (nonCollapsed && this.mode === 'normal') {
      this.setMode('visual');
    } else if (!nonCollapsed && this.inVisual) {
      this.setMode('normal');
    }
  }
}
