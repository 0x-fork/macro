/**
 * Soup filter evaluation backed by the Rust `soup_filter_eval` crate,
 * compiled to wasm. One implementation of filter semantics — the same
 * `item_filters` AST the backend compiles to SQL — instead of the
 * TypeScript mirrors in `compile.ts` / `query-filters.ts`.
 *
 * Evaluation is three-valued: `'match'`, `'noMatch'`, or `'unknown'`.
 * `'unknown'` means the cached payload doesn't carry enough data to decide
 * (notification state, task assignees, message-level email addresses, …) and
 * the caller should fall back to server reconciliation — i.e. exactly the
 * cases where today's TS matcher silently guesses.
 */

import type { SoupFilter } from '../pkg/soup_filter_wasm';

export type SoupFilterVerdict = 'match' | 'noMatch' | 'unknown';

// Mirrors the Rust `Verdict` enum (0 = NoMatch, 1 = Match, 2 = Unknown).
const VERDICT_BY_CODE: Record<number, SoupFilterVerdict | undefined> = {
  0: 'noMatch',
  1: 'match',
  2: 'unknown',
};

function toVerdict(code: number): SoupFilterVerdict {
  return VERDICT_BY_CODE[code] ?? 'unknown';
}

/** A compiled soup filter, reusable across many item checks. */
export interface CompiledSoupFilter {
  /** Evaluate one SoupApiItem (the `{tag, data}` wire object). */
  matches(item: unknown): SoupFilterVerdict;
  /** Evaluate many items in a single wasm boundary crossing. */
  matchesMany(items: readonly unknown[]): SoupFilterVerdict[];
  /** The canonical expanded AST JSON — the `POST /items/soup/ast` body. */
  astJson(): string;
  /** Release the wasm-held filter. */
  dispose(): void;
}

function wrap(filter: SoupFilter): CompiledSoupFilter {
  return {
    matches: (item) => toVerdict(filter.matches(JSON.stringify(item))),
    matchesMany: (items) =>
      Array.from(filter.matchesMany(JSON.stringify(items)), toVerdict),
    astJson: () => filter.astJson(),
    dispose: () => filter.free(),
  };
}

type WasmModule = typeof import('../pkg/soup_filter_wasm');

let modulePromise: Promise<WasmModule> | undefined;

/**
 * Load (and cache) the wasm module. Roughly 190KB gzipped — call it lazily
 * from the soup data layer, not at app startup.
 */
export function loadSoupFilterWasm(): Promise<WasmModule> {
  modulePromise ??= import('../pkg/soup_filter_wasm');
  return modulePromise;
}

/**
 * Compile a raw filter AST (the `PostSoupAstRequest` filter fields:
 * `{df, pf, cf, ef, chanf, callf, ccf, fef, propf}`).
 *
 * `currentUserId` (e.g. `macro|user@example.com`) enables requester-dependent
 * predicates such as the task created-by-me filter.
 */
export async function compileSoupAst(
  ast: unknown,
  currentUserId?: string
): Promise<CompiledSoupFilter> {
  const mod = await loadSoupFilterWasm();
  return wrap(mod.SoupFilter.fromAst(JSON.stringify(ast), currentUserId));
}

/**
 * Compile typed soup filters (the `POST /items/soup` body shape, e.g.
 * `{document_filters: {...}, email_filters: {...}}`). Expansion runs through
 * the same Rust code path the backend uses, so malformed filters throw the
 * same errors the endpoint would return.
 */
export async function compileSoupFilters(
  filters: unknown,
  currentUserId?: string
): Promise<CompiledSoupFilter> {
  const mod = await loadSoupFilterWasm();
  return wrap(
    mod.SoupFilter.fromTypedFilters(JSON.stringify(filters), currentUserId)
  );
}
