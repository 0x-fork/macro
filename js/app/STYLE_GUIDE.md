# Frontend Code Review Style Guide (js/app, lexical-core)

Conventions reviewers repeatedly enforce on frontend PRs, mined from every human review
comment on PRs #3650–#4653 (997 PRs, 315 human inline comments) and kept current by
adding a rule whenever a reviewer types the same comment twice. CodeRabbit ingests this
file (`knowledge_base.code_guidelines` in `.coderabbit.yaml`), so rules here become
automated review comments.

**Format.** One rule per line: `FE-<id> [scope] rule (evidence · enforcement · docs)`.
IDs are stable — cite them in review comments ("see FE-12"), never renumber or reuse
them; deletions leave gaps and new rules append with the next free number. Scope tags
make the list greppable.

Scopes: `[data]` data fetching & queries · `[solid]` Solid reactivity & state ·
`[async]` async & error handling · `[arch]` architecture & module hygiene · `[ts]`
TypeScript · `[ui]` UI / UX conventions

---

- **FE-01** `[data]` Never call a service client outside the `queries` package — UI code
  calling an endpoint directly is usually re-fetching data an existing query already
  caches. (#3750, #3961 · also: AGENTS.md)
- **FE-02** `[data]` Every query module has a `keys.ts` structured like the existing
  ones. (#3710)
- **FE-03** `[data]` Conditional fetching uses a debounced signal passed to TanStack
  Query's `enabled`, not a custom resource. (#3961)
- **FE-04** `[data]` Pre-populating data means exposing a cache-seeding method on the
  query, not an ad hoc manual cache. (#4020)
- **FE-05** `[data]` Data-dependent UI that must not suspend uses `queryReadyGate`.
  (#4077)
- **FE-06** `[data]` Extend `QUERY_FILTERS_BASE` instead of re-deriving filter
  exclusions per query, and prefer explicit include lists — exclude lists silently break
  when a new entity type is added. (#3947, #4260)
- **FE-07** `[data]` Don't hardcode backend-owned config in the frontend (e.g. system
  bot config) — fetch it dynamically or generate types from the backend source of
  truth. (#3692)
- **FE-08** `[solid]` No ad-hoc global state modules — shared state for a subtree lives
  in a Context scoped to a clear ownership boundary. (#3750 · also: AGENTS.md)
- **FE-09** `[solid]` Derive, don't sync — an effect that only copies one signal into
  another similarly-shaped signal should be a derived signal at the appropriate level.
  (#3898)
- **FE-10** `[solid]` `createEffect` is for external/imperative systems only (DOM APIs,
  third-party libs, navigation events) — never for deriving state; use `on()` to make
  dependencies explicit when an effect is warranted. (#3750, #3898 · also: AGENTS.md)
- **FE-11** `[solid]` Check `solid-primitives` before writing a custom reactive utility.
  (also: AGENTS.md)
- **FE-12** `[async]` `async`/`await` with `try`/`catch`, not `.then()`/`.catch()`
  chains. (#3716, #3781 · enforced: oxlint `promise/prefer-await-to-then` —
  `bun run lint:oxlint` from `js/`)
- **FE-13** `[async]` Extract multi-step async coordination into named helper functions,
  and make intentionally-unawaited promises explicit — no bare floating promises.
  (#3781)
- **FE-14** `[async]` Keep neverthrow `Result`/`ResultAsync` intact end-to-end — use the
  existing helpers (`ResultAsync`, `throwOnError` in `queryOptions`, `catchToResult`)
  instead of ad hoc `Promise <-> Result` conversions. (#3781, #4373)
- **FE-15** `[async]` Guard once, at the top — missing/invalid state gets an early
  return at the start of the function or hook, not a repeated check in every branch or
  a silent fall-through. (#3750, #4057)
- **FE-16** `[arch]` Keep modules single-purpose: feature-specific logic out of generic
  util files, generic/collaboration logic decoupled from feature specifics, styling out
  of core business logic. (#3750, #3781, #3947)
- **FE-17** `[arch]` Reuse existing shared utilities and primitives before hand-rolling
  (`removeNodeAndRestoreSelection`, Kobalte components) — re-implementations
  reintroduce bugs that were already fixed. (#4281, #4321 · also: AGENTS.md)
- **FE-18** `[arch]` Within a package, use relative imports — don't route through the
  package's own barrel file; it adds indirection and invites circular dependencies.
  (#3692)
- **FE-19** `[ts]` Trust `match` narrowing — an exhaustive `ts-pattern` match already
  narrows the type inside each closure; a manual `Extract<>` alias is redundant. (#4201)
- **FE-20** `[ts]` Exhaustive branching uses `match` from `ts-pattern`. (also: AGENTS.md)
- **FE-21** `[ts]` No `any` — proper types or `unknown` + type guards. (also: AGENTS.md)
- **FE-22** `[ui]` Pending or permission-gated actions render as a dimmed version of the
  real UI with inline accept/reject controls — not a generic placeholder icon. (#4201)
- **FE-23** `[ui]` Disclosure carets rotate 180° to point down when expanded, matching
  Discussion, SplitFileMenu, CollapsibleMessage, etc. (#4582)
- **FE-24** `[ui]` Truncated/collapsed controls get a tooltip (matching the app's
  tooltip pattern) so the lost label stays discoverable. (#4492)
- **FE-25** `[ui]` Semantic color tokens, not raw Tailwind palette classes — the default
  palette is disabled via `--color-*: initial` in `packages/app/index.css`, so classes
  like `text-red-500` silently render nothing. (enforced: ast-grep
  `tsx-no-raw-tailwind-palette`, CI error · also: AGENTS.md)
- **FE-26** `[ui]` Prefer composition over configurability; keep reusable components
  small and free of queries/complex state. (also: AGENTS.md)
- **FE-27** `[ui]` Don't add `cursor-pointer` to clickable elements. (enforced: ast-grep
  `tsx-no-cursor-pointer`, warning · also: AGENTS.md)

---

*Provenance: mined 2026-07-09 from human review comments on PRs #3650–#4653. Next free
id: FE-28.*
