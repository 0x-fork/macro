import {
  $createTextNode,
  $findMatchingParent,
  $isElementNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
  type TextFormatType,
  type TextNode,
} from 'lexical';

export type Scope = { kind: 'nth'; n: number } | { kind: 'all' };

const FORMAT_MAP: Record<string, TextFormatType> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikethrough',
  code: 'code',
};

export type InlineFormat = 'bold' | 'italic' | 'underline' | 'strike' | 'code';

/** Format a substring (split the text node and set the format bit). */
export function $formatTextInBlock(
  block: ElementNode,
  needle: string,
  format: InlineFormat,
  scope?: Scope
): number {
  const fmt = FORMAT_MAP[format];
  return mutateMatches(block, needle, scope, (matchNode) => {
    if (!matchNode.hasFormat(fmt)) {
      matchNode.toggleFormat(fmt);
    }
  });
}

/** Remove formatting from a substring (omit `format` to clear all). */
export function $clearFormat(
  block: ElementNode,
  needle: string,
  format?: InlineFormat,
  scope?: Scope
): number {
  return mutateMatches(block, needle, scope, (matchNode) => {
    if (format) {
      const fmt = FORMAT_MAP[format];
      if (matchNode.hasFormat(fmt)) {
        matchNode.toggleFormat(fmt);
      }
    } else {
      matchNode.setFormat(0);
    }
  });
}

/** Strip all inline formatting (bold, italic, underline, etc.) from every text node in a block. */
export function $stripFormat(block: ElementNode): void {
  for (const node of block.getAllTextNodes()) {
    node.setFormat(0);
  }
}

/**
 * Literal text replace. Mutates matched text nodes IN PLACE (via
 * `setTextContent`) so their durable ids survive — the diff then sees a clean
 * `setText{from,to}` instead of node churn, which is what lets the replay
 * highlight/animate the exact changed span.
 *
 * Matches across run boundaries: the needle is found in the block's flattened
 * text, so `replace` works on prose interrupted by bold/code spans. The
 * replacement text lands in the first run it touched (inheriting that run's
 * formatting) and the matched remainder is removed from the following runs.
 */
// TODO(wolf): unreliable on code blocks -- their children are per-token
// code-highlight nodes, so a `find` can span a Prism token boundary
export function $replaceString(
  block: ElementNode,
  find: string,
  replace: string,
  scope?: Scope
): number {
  if (find.length === 0) return 0;

  // Flatten the block's runs into one string with an index back to each run.
  // Matching on the flat text is what lets a needle span a formatting boundary
  // (`total **408** done`), which the per-run walk could never see — the single
  // largest source of silently-missed `replace` calls in the prod corpus.
  const runs = block.getAllTextNodes().map((node) => ({
    node,
    text: node.getTextContent(),
    start: 0,
  }));
  let cursor = 0;
  for (const run of runs) {
    run.start = cursor;
    cursor += run.text.length;
  }
  const flat = runs.map((r) => r.text).join('');

  const hits: number[] = [];
  for (let i = flat.indexOf(find); i !== -1; i = flat.indexOf(find, i + find.length)) {
    hits.push(i);
  }
  if (hits.length === 0) return 0;

  const all = scope?.kind === 'all';
  const nth = scope?.kind === 'nth' ? scope.n : undefined;
  const chosen = all
    ? hits
    : nth != null
      ? hits[nth - 1] === undefined
        ? []
        : [hits[nth - 1]!]
      : [hits[0]!];
  if (chosen.length === 0) return 0;

  // Apply back-to-front so earlier offsets stay valid as text shrinks/grows.
  for (const at of [...chosen].sort((a, b) => b - a)) {
    const end = at + find.length;
    const touched = runs.filter((r) => r.start < end && r.start + r.text.length > at);
    if (touched.length === 0) continue;

    // The replacement lands in the first touched run, inheriting its formatting;
    // the matched remainder is deleted from the runs that follow.
    const first = touched[0]!;
    const firstFrom = at - first.start;
    const firstTo = Math.min(first.text.length, end - first.start);
    first.text = first.text.slice(0, firstFrom) + replace + first.text.slice(firstTo);

    for (const run of touched.slice(1)) {
      const from = Math.max(0, at - run.start);
      const to = Math.min(run.text.length, end - run.start);
      run.text = run.text.slice(0, from) + run.text.slice(to);
    }
  }

  // Write back, keeping durable ids by mutating in place. A run emptied by the
  // replacement is dropped, as an empty text node would render as nothing.
  for (const run of runs) {
    if (run.text === run.node.getTextContent()) continue;
    if (run.text.length === 0) run.node.remove();
    else run.node.setTextContent(run.text);
  }

  return chosen.length;
}

/** Append plain text to the end of a block. Extends the trailing plain text node
 *  in place (preserving its id) when possible, else adds a new node. */
export function $appendText(block: ElementNode, text: string): void {
  const last = block.getLastChild();
  if ($isTextNode(last) && last.getFormat() === 0) {
    last.setTextContent(last.getTextContent() + text);
  } else {
    block.append($createTextNode(text));
  }
}

/** Prepend plain text to the start of a block. Extends the leading plain text
 *  node in place (preserving its id) when possible, else adds a new node. */
export function $prependText(block: ElementNode, text: string): void {
  const first = block.getFirstChild();
  if ($isTextNode(first) && first.getFormat() === 0) {
    first.setTextContent(text + first.getTextContent());
  } else if (first) {
    first.insertBefore($createTextNode(text));
  } else {
    block.append($createTextNode(text));
  }
}

/**
 * Core inline-match engine. Finds occurrences of `needle` in the block's
 * FLATTENED text, splits every run the match overlaps at the match boundaries,
 * then calls `apply` on each isolated segment. Returns the number of
 * occurrences acted on.
 *
 * Matching on the flat text means a needle spanning a formatting boundary is
 * found — `inlineCode` over `build_content_has_child_clauses` where part of it is
 * already a code span was the single most common residual failure. A match that
 * crosses runs is applied to each overlapping segment, which is the same result
 * as selecting across the boundary in the editor and applying the format.
 */
function mutateMatches(
  block: ElementNode,
  needle: string,
  scope: Scope | undefined,
  apply: (matchNode: TextNode) => void
): number {
  if (needle.length === 0) {
    return 0;
  }
  const all = scope?.kind === 'all';
  // `nth` is 1-based per occurrence; default targets the first occurrence.
  const nth = scope?.kind === 'nth' ? scope.n : undefined;

  // 1) Flatten the block's runs, keeping each run's absolute start offset, and
  //    find the needle in the flat text. Matching on the flat text is what lets
  //    a needle span a formatting boundary — the per-run walk this replaced
  //    could not see `total **408**` as the single string "total 408".
  const runs = block
    .getAllTextNodes()
    .map((node) => ({ node, text: node.getTextContent(), start: 0 }));
  let cursor = 0;
  for (const run of runs) {
    run.start = cursor;
    cursor += run.text.length;
  }
  const flat = runs.map((r) => r.text).join('');

  const hits: number[] = [];
  for (
    let i = flat.indexOf(needle);
    i !== -1;
    i = flat.indexOf(needle, i + needle.length)
  ) {
    hits.push(i);
  }
  if (hits.length === 0) {
    return 0;
  }

  // 2) Decide which occurrences to act on.
  const chosen = all
    ? hits
    : nth != null
      ? hits[nth - 1] === undefined
        ? []
        : [hits[nth - 1]!]
      : [hits[0]!];
  if (chosen.length === 0) {
    return 0;
  }

  // 3) For each chosen occurrence, split every run it overlaps at the match
  //    boundaries and apply to the isolated segments. A match crossing runs
  //    yields several segments — applying to each is what a user selecting
  //    across a bold boundary and pressing Cmd+B gets.
  //    Work back-to-front: splitting mutates the tree, and later offsets would
  //    otherwise be invalidated.
  let count = 0;
  for (const at of [...chosen].sort((a, b) => b - a)) {
    const end = at + needle.length;
    const touched = runs.filter(
      (r) => r.start < end && r.start + r.text.length > at
    );
    if (touched.length === 0) continue;

    for (const run of touched) {
      const from = Math.max(0, at - run.start);
      const to = Math.min(run.text.length, end - run.start);
      if (to <= from) continue;

      const boundaries = [from, to].filter((b) => b > 0 && b < run.text.length);
      const pieces =
        boundaries.length > 0 ? run.node.splitText(...boundaries) : [run.node];
      // The segment covering [from, to) is the piece starting at `from`.
      let pos = 0;
      for (const piece of pieces) {
        const len = piece.getTextContent().length;
        if (pos === from) {
          apply(piece);
          break;
        }
        pos += len;
      }
    }
    count++;
  }
  return count;
}

/** Wrap a matched substring in a new element node (link, mark, …). Returns the count changed. */
export function $wrapInBlock(
  block: ElementNode,
  needle: string,
  createWrapper: () => ElementNode,
  scope?: Scope
): number {
  return mutateMatches(block, needle, scope, (matchNode) => {
    const wrapper = createWrapper();
    matchNode.replace(wrapper);
    wrapper.append(matchNode);
  });
}

function $unwrapWrapper(
  matchNode: TextNode,
  pred: (n: LexicalNode) => boolean
): void {
  const p = matchNode.getParent();
  const parent = p ? $findMatchingParent(p, pred) : null;
  if (!parent || !$isElementNode(parent)) return;
  for (const child of parent.getChildren()) parent.insertBefore(child);
  parent.remove();
}

/** Remove the nearest wrapper matching `pred` from a matched substring. Returns the count changed. */
export function $unwrapFromBlock(
  block: ElementNode,
  needle: string,
  pred: (n: LexicalNode) => boolean,
  scope?: Scope
): number {
  return mutateMatches(block, needle, scope, (matchNode) =>
    $unwrapWrapper(matchNode, pred)
  );
}
