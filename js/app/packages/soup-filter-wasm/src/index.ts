/**
 * Soup filter evaluation backed by the Rust `soup_filter_eval` crate,
 * compiled to wasm. One implementation of filter semantics — the same
 * `item_filters` AST the backend compiles to SQL — instead of the
 * TypeScript mirrors in `compile.ts` / `query-filters.ts`.
 *
 * Evaluation is three-valued: `'match'`, `'noMatch'`, or `'unknown'`.
 * `'unknown'` means the cached payload doesn't carry enough data to decide
 * and the caller should fall back to server reconciliation — i.e. exactly
 * the cases where today's TS matcher silently guessed. Two escape hatches
 * shrink the unknown set:
 *
 * - {@link SoupFilterOptions} provides requester context (current user,
 *   the system Assignees property id) enabling task predicates.
 * - {@link SoupItemState} asserts per-item notification existence from the
 *   frontend's notification cache, enabling done/seen filters.
 */

import type { SoupFilter } from '../pkg/soup_filter_wasm';

export type SoupFilterVerdict = 'match' | 'noMatch' | 'unknown';

/** Requester context for predicates that depend on the current user. */
export interface SoupFilterOptions {
  /** The requesting user's macro user id (e.g. `macro|user@example.com`). */
  currentUserId?: string;
  /** The system Assignees property definition id (SYSTEM_PROPERTY_IDS.ASSIGNEES). */
  assigneesPropertyId?: string;
}

/**
 * Caller-asserted per-item notification existence, mirroring the backend's
 * EXISTS probes (`NotificationDone(true)` matches when *at least one*
 * notification with `done = true` exists, etc.). Only assert what you can
 * prove: when reading a paginated cache, assert positives (`true`) and leave
 * the rest undefined.
 */
export interface SoupItemState {
  hasDoneNotification?: boolean;
  hasUndoneNotification?: boolean;
  hasSeenNotification?: boolean;
  hasUnseenNotification?: boolean;
}

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
  /**
   * Evaluate one SoupApiItem (the `{tag, data}` wire object), optionally
   * with caller-asserted notification state for that item.
   */
  matches(item: unknown, state?: SoupItemState): SoupFilterVerdict;
  /**
   * Evaluate many items in a single wasm boundary crossing. `states`, when
   * given, must be the same length (null entries mean "don't know").
   */
  matchesMany(
    items: readonly unknown[],
    states?: readonly (SoupItemState | null)[]
  ): SoupFilterVerdict[];
  /** The canonical expanded AST JSON — the `POST /items/soup/ast` body. */
  astJson(): string;
  /** Release the wasm-held filter. */
  dispose(): void;
}

function wrap(filter: SoupFilter): CompiledSoupFilter {
  return {
    matches: (item, state) =>
      toVerdict(
        filter.matches(
          JSON.stringify(item),
          state ? JSON.stringify(state) : undefined
        )
      ),
    matchesMany: (items, states) =>
      Array.from(
        filter.matchesMany(
          JSON.stringify(items),
          states ? JSON.stringify(states) : undefined
        ),
        toVerdict
      ),
    astJson: () => filter.astJson(),
    dispose: () => filter.free(),
  };
}

type WasmModule = typeof import('../pkg/soup_filter_wasm');

let modulePromise: Promise<WasmModule> | undefined;

/**
 * Load (and cache) the wasm module. Roughly 200KB gzipped — call it lazily
 * from the soup data layer, not at app startup.
 */
export function loadSoupFilterWasm(): Promise<WasmModule> {
  modulePromise ??= import('../pkg/soup_filter_wasm');
  return modulePromise;
}

function serializeOptions(options?: SoupFilterOptions): string | undefined {
  return options ? JSON.stringify(options) : undefined;
}

/**
 * Compile a raw filter AST (the `PostSoupAstRequest` filter fields:
 * `{df, pf, cf, ef, chanf, callf, ccf, fef, propf}`).
 */
export async function compileSoupAst(
  ast: unknown,
  options?: SoupFilterOptions
): Promise<CompiledSoupFilter> {
  const mod = await loadSoupFilterWasm();
  return wrap(
    mod.SoupFilter.fromAst(JSON.stringify(ast), serializeOptions(options))
  );
}

/**
 * Compile typed soup filters (the `POST /items/soup` body shape, e.g.
 * `{document_filters: {...}, email_filters: {...}}`). Expansion runs through
 * the same Rust code path the backend uses, so malformed filters throw the
 * same errors the endpoint would return.
 */
export async function compileSoupFilters(
  filters: unknown,
  options?: SoupFilterOptions
): Promise<CompiledSoupFilter> {
  const mod = await loadSoupFilterWasm();
  return wrap(
    mod.SoupFilter.fromTypedFilters(
      JSON.stringify(filters),
      serializeOptions(options)
    )
  );
}
