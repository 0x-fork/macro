/* tslint:disable */
/* eslint-disable */

/**
 * A compiled soup filter, reusable across many item checks.
 */
export class SoupFilter {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The expanded AST as JSON — the exact body for `POST /items/soup/ast`.
     *
     * Lets the frontend build typed filters once and obtain the canonical
     * AST from the same Rust expansion the backend uses, instead of
     * mirroring the expansion in TypeScript.
     */
    astJson(): string;
    /**
     * Build a filter from a raw AST JSON string — the body shape of
     * `POST /items/soup/ast` (`{"df": ..., "ef": ..., ...}`).
     *
     * `current_user_id` enables requester-dependent predicates (e.g. the
     * task created-by-me filter); pass `undefined` to leave them
     * undecidable.
     */
    static fromAst(ast_json: string, current_user_id?: string | null): SoupFilter;
    /**
     * Build a filter from typed filters JSON — the body shape of
     * `POST /items/soup` (`{"document_filters": ..., ...}`).
     *
     * Expansion runs through the same `EntityFilterAst::new_from_filters`
     * the soup router uses, so malformed filters fail here with the same
     * errors the endpoint would produce.
     */
    static fromTypedFilters(filters_json: string, current_user_id?: string | null): SoupFilter;
    /**
     * Evaluate one `SoupApiItem` JSON string. Returns a [`Verdict`].
     */
    matches(soup_item_json: string): Verdict;
    /**
     * Evaluate a JSON array of `SoupApiItem`s in one boundary crossing.
     * Returns one [`Verdict`] code per item, in order.
     */
    matchesMany(soup_items_json: string): Uint8Array;
}

/**
 * Verdict codes returned across the JS boundary.
 *
 * Kept as plain numbers so `matchesMany` can return a compact `Uint8Array`.
 */
export enum Verdict {
    /**
     * The item definitely matches the filter.
     */
    Match = 1,
    /**
     * The item definitely does not match the filter.
     */
    NoMatch = 0,
    /**
     * Locally undecidable — fall back to server reconciliation.
     */
    Unknown = 2,
}
