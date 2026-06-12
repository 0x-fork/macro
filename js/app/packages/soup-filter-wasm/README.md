# soup-filter-wasm

Soup filter semantics, written once in Rust, evaluated locally.

The backend's soup endpoints (`POST /items/soup`, `POST /items/soup/ast`)
filter heterogeneous entities with an AST defined in
`rust/cloud-storage/item_filters` and compiled to SQL in
`rust/cloud-storage/soup`. The frontend previously re-implemented pieces of
those semantics by hand:

- `packages/app/component/next-soup/filters/filter-store/compile.ts` — mirrors
  the AST combinators and ~50 field mappings;
- `packages/app/component/next-soup/filters/query-filters.ts` — re-implements
  filter *matching* for optimistic cache inserts, with a TODO admitting it
  only covers a subset.

This package replaces the matching half (and the canonical-AST half of the
building) with the real Rust implementation, compiled to wasm:

- `rust/cloud-storage/soup_filter_eval` — three-valued evaluator over the
  `item_filters` AST, with per-literal semantics documented against the SQL
  builders and tests that serialize genuine `models_soup` values.
- `rust/cloud-storage/soup_filter_wasm` — wasm-bindgen bindings
  (~190KB gzipped, built with wasm-pack).

## Three-valued results

`matches()` returns `'match' | 'noMatch' | 'unknown'`:

| Verdict | Meaning | Caller action |
|---|---|---|
| `match` | The item definitely satisfies the filter | e.g. optimistically insert |
| `noMatch` | The item definitely does not | e.g. skip / remove |
| `unknown` | The cached payload can't decide (notification state, task assignees, message-level email addresses, …) | fall back to refetch/invalidate |

Today's TS matcher answers `true` for every filter it doesn't implement;
`unknown` makes that case explicit instead of silently wrong.

## Usage

```ts
import { compileSoupFilters } from '@soup-filter-wasm';

const filter = await compileSoupFilters(requestBody, currentUserId);
const verdict = filter.matches(soupApiItem); // 'match' | 'noMatch' | 'unknown'

// Batch APIs cross the wasm boundary once:
const verdicts = filter.matchesMany(page.items);

// The canonical expanded AST (what POST /items/soup/ast accepts):
const astBody = filter.astJson();

filter.dispose();
```

## Building the wasm artifact

The `pkg/` directory is generated and not committed:

```sh
cargo install wasm-pack   # once
cd rust/cloud-storage
just build_soup_filter_wasm
```

The app's Vite config already includes `vite-plugin-wasm`, which handles the
wasm-pack `bundler`-target output emitted here.

## Wiring into the app (follow-up)

This package is intentionally not imported anywhere yet. The intended first
integration is `insertSoupEntity`'s cache-matching predicate
(`filterSoupItemByRequestBody`), treating `unknown` the way the soup layer
already treats "couldn't decide": skip the optimistic insert and let
`refetchSoupEntity` reconcile. Add a `@soup-filter-wasm` path alias to
`js/app/tsconfig.json` when wiring it up.
