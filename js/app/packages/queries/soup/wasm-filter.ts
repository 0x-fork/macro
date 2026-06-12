/**
 * Synchronous soup item filters backed by the Rust wasm evaluator
 * (`@soup-filter-wasm`), for use as TanStack `meta.itemFilter` predicates in
 * the normalized cache's optimistic operations.
 *
 * The wasm module loads asynchronously while the filter contract is
 * synchronous, so this facade is deliberately permissive: until the module is
 * ready — and whenever the evaluator answers `'unknown'` (the cached payload
 * lacks the data the SQL would consult: notification state, task assignees,
 * message-level email addresses, …) — items pass the filter, matching the
 * historical behavior of the hand-written TS matcher, which passed every
 * filter it didn't implement. A definite `'noMatch'` from the evaluator
 * (impossible to express for AST queries in TS before this) skips the
 * optimistic insert; the server refetch reconciles anything permissiveness
 * lets through.
 */

import type { SoupApiItem } from '@service-storage/generated/schemas';
import {
  type CompiledSoupFilter,
  compileSoupAst,
  compileSoupFilters,
  loadSoupFilterWasm,
} from '@soup-filter-wasm';

let wasmReady = false;
let warnedCompileFailure = false;

// Kick the (~190KB gzipped) module load as soon as the soup query layer is
// imported, so filters are live by the time a user can trigger an optimistic
// insert.
const preload = loadSoupFilterWasm().then(() => {
  wasmReady = true;
});
preload.catch(() => {
  // Permissive fallback stays in effect; soup behaves like before the wasm
  // filter existed.
});

type FilterKind = 'typed' | 'ast';

/**
 * Compiled filters cached by their serialized body. Soup view bodies are few
 * and stable within a session; a small LRU keeps wasm memory bounded while
 * letting every insert reuse the compiled AST.
 */
const compiledCache = new Map<string, CompiledSoupFilter>();
const COMPILED_CACHE_MAX = 64;

function rememberCompiled(key: string, filter: CompiledSoupFilter) {
  compiledCache.set(key, filter);
  if (compiledCache.size > COMPILED_CACHE_MAX) {
    const [oldestKey, oldest] = compiledCache.entries().next().value as [
      string,
      CompiledSoupFilter,
    ];
    compiledCache.delete(oldestKey);
    oldest.dispose();
  }
}

async function compile(
  kind: FilterKind,
  bodyJson: string
): Promise<CompiledSoupFilter> {
  const body: unknown = JSON.parse(bodyJson);
  return kind === 'ast'
    ? await compileSoupAst(body)
    : await compileSoupFilters(body);
}

function getCompiled(
  kind: FilterKind,
  bodyJson: string
): CompiledSoupFilter | undefined {
  const key = `${kind}:${bodyJson}`;
  const cached = compiledCache.get(key);
  if (cached) return cached;
  if (!wasmReady) return undefined;
  // The module is loaded, so compile() resolves on the microtask queue; the
  // current (synchronous) check stays permissive and the next one hits the
  // cache. Avoids blocking inserts on JSON round-trips for brand-new bodies.
  compile(kind, bodyJson)
    .then((filter) => rememberCompiled(key, filter))
    .catch((err) => {
      if (!warnedCompileFailure) {
        warnedCompileFailure = true;
        console.warn('[soup] wasm filter compilation failed', err);
      }
    });
  return undefined;
}

/**
 * Build a synchronous `(item) => boolean` insert predicate for a soup list
 * query. `kind: 'typed'` takes the `POST /items/soup` body; `kind: 'ast'`
 * takes the `POST /items/soup/ast` body (extra non-filter fields like
 * `email_view` are ignored by the Rust side).
 */
export function makeSoupItemFilter(
  kind: FilterKind,
  getBody: () => unknown
): (item: SoupApiItem) => boolean {
  return (item) => {
    const body = getBody();
    if (!body) return true;
    const compiled = getCompiled(kind, JSON.stringify(body));
    if (!compiled) return true;
    return compiled.matches(item) !== 'noMatch';
  };
}
