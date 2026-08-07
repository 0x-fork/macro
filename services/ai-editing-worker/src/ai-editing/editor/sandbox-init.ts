/**
 * The snippet that bootstraps a sandbox before the writer's code runs.
 *
 * Shared by every sandbox host so they cannot drift: `src/sandbox.ts` under
 * wrangler, and any other loader that needs the same context (a replay harness
 * is only meaningful while it executes what production executes).
 *
 * `editor` is wrapped in a proxy that turns a call to a method that does not
 * exist into a suggestion. Writers reach for plausible-but-absent names
 * (`appendListItemAfter`, `insertListAfter`, `getText`, `getBlock`, `readBlock`)
 * and used to get a bare `editor.getText is not a function`, which names the
 * mistake but not the way out — so the next call is a guess. Naming the closest
 * real methods makes the failure recoverable in one step.
 */

/** Build the init source for a sandbox context. */
export function sandboxInit(
  validIds: Iterable<string>,
  refs: string[],
  snippets: Record<string, string> | undefined
): string {
  return [
    `const __editor = new DocumentEditor({ validIds: ${JSON.stringify([...validIds])}, refs: ${JSON.stringify(refs)} });`,
    SUGGEST_HELPER,
    'const editor = __wrapEditor(__editor);',
    `const snippets = ${JSON.stringify(snippets ?? {})};`,
  ].join('\n');
}

/**
 * Emitted into the sandbox. Kept as source text because it has to run inside
 * QuickJS, which shares no module graph with the host.
 */
const SUGGEST_HELPER = `
function __editorMethodNames(target) {
  const names = new Set();
  for (
    let proto = target;
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor' || key.startsWith('_')) continue;
      if (typeof target[key] === 'function') names.add(key);
    }
  }
  return [...names];
}

/** Case-insensitive containment either way, then shared-prefix length. Crude,
 *  but it reliably surfaces appendListItem for appendListItemAfter. */
function __suggestMethods(wanted, names) {
  const w = wanted.toLowerCase();
  const scored = names.map((name) => {
    const n = name.toLowerCase();
    let score = 0;
    if (n === w) score = 1000;
    else if (n.includes(w) || w.includes(n)) score = 100 + Math.min(n.length, w.length);
    else {
      let i = 0;
      while (i < n.length && i < w.length && n[i] === w[i]) i++;
      score = i;
    }
    return { name, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score >= 3).slice(0, 3).map((s) => s.name);
}

function __wrapEditor(target) {
  return new Proxy(target, {
    get(obj, prop) {
      const value = obj[prop];
      if (value !== undefined || typeof prop !== 'string') {
        return typeof value === 'function' ? value.bind(obj) : value;
      }
      return () => {
        const suggestions = __suggestMethods(prop, __editorMethodNames(obj));
        throw new Error(
          'editor.' + prop + ' does not exist' +
            (suggestions.length
              ? '. Did you mean: ' + suggestions.join(', ') + '?'
              : '.') +
            ' The editor is write-only — to inspect the document use the readDocument tool, not a call inside the snippet.'
        );
      };
    },
  });
}
`;
