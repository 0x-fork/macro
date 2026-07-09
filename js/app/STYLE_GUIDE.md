# Frontend Code Review Style Guide (js/app, lexical-core)

Conventions that reviewers repeatedly enforce on frontend PRs. This file was produced by
mining every human review comment on the last ~1000 PRs (#3650–#4653) and clustering the
recurring, generalizable feedback. PR numbers after each rule link to real review threads
where the rule came up.

**How to use this file**

- Authors: read it before opening a PR; it is the checklist reviewers grade against.
- Reviewers: when you leave the same comment a second time, add the rule here instead of
  typing it a third time.
- Bots: CodeRabbit ingests this file via `knowledge_base.code_guidelines` in
  `.coderabbit.yaml`, so rules added here become automated review comments.

Rules marked **(also in AGENTS.md)** confirm existing documented guidance — kept here so
this file works as a standalone review checklist.

---

## 1. Data fetching: the queries package owns it

- **Never call a service client outside the `queries` package.** UI code calling an
  endpoint directly is usually re-fetching data that is already cached by an existing
  query. (#3750, #3961) **(also in AGENTS.md)**
- **Every query module has a `keys.ts`** structured like the existing ones. (#3710)
- **Use TanStack Query's built-in mechanisms before writing custom fetch/cache logic:**
  - conditional fetching → a debounced signal passed to `enabled`, not a custom resource
    (#3961)
  - pre-populating data → expose a cache-seeding method on the query, not an ad hoc manual
    cache (#4020)
  - data-dependent UI that must not suspend → `queryReadyGate` (#4077)
- **Extend `QUERY_FILTERS_BASE` instead of re-deriving filter exclusions per query**, and
  prefer explicit *include* lists over exclude lists — excludes silently break when a new
  entity type is added. (#3947, #4260)
- **Don't hardcode backend-owned config in the frontend** (e.g. system bot config): fetch
  it dynamically or generate types from the backend source of truth. (#3692)

## 2. Solid reactivity & state

- **No ad-hoc global state modules.** Shared state for a subtree lives in a Context
  (e.g. call state), scoped to a clear ownership boundary. (#3750)
  **(also in AGENTS.md)**
- **Derive, don't sync.** If an effect exists only to copy one signal into another
  similarly-shaped signal, replace it with a derived signal at the appropriate level.
  (#3898)
- **`createEffect` is for external/imperative systems only** (DOM APIs, third-party libs,
  reacting to a navigation event) — never for deriving state. Use `on()` to make
  dependencies explicit when an effect is warranted. (#3750, #3898) **(also in AGENTS.md)**
- **Check `solid-primitives` before writing a custom reactive utility.**
  **(also in AGENTS.md)**

## 3. Async & error handling

- **`async`/`await` with `try`/`catch`, not `.then()`/`.catch()` chains.** (#3716, #3781)
  *Enforced:* oxlint `promise/prefer-await-to-then` (`bun run lint:oxlint` from `js/`).
- **Extract multi-step async coordination into named helper functions**, and when a
  promise is intentionally not awaited, make the fire-and-forget explicit rather than
  leaving a bare floating promise. (#3781)
- **Keep neverthrow `Result`/`ResultAsync` intact end-to-end.** Use the existing helpers —
  `ResultAsync`, `throwOnError` (in `queryOptions`, as done in many places), and
  `catchToResult` — instead of ad hoc `Promise <-> Result` conversions. (#3781, #4373)
- **Guard once, at the top.** Missing/invalid state gets an early return at the start of
  the function or hook — not a repeated check in every branch, and never a silent
  fall-through that lets the action run anyway. (#3750, #4057)

## 4. Architecture & module hygiene

- **Keep modules single-purpose.** Feature-specific logic doesn't belong in generic util
  files (split it into its own file), generic/collaboration logic stays decoupled from
  feature specifics (blockId/blockError), and styling stays out of core business logic.
  (#3750, #3781, #3947)
- **Reuse existing shared utilities and primitives before hand-rolling:** selection/caret
  handling (`removeNodeAndRestoreSelection`), Kobalte components (Color Area/Slider) —
  re-implementations reintroduce bugs that were already fixed. (#4281, #4321)
  **(also in AGENTS.md: check solid-primitives / Kobalte first)**
- **Within a package, use relative imports** — don't route through the package's barrel
  file; it adds indirection and invites circular dependencies. (#3692)

## 5. TypeScript

- **Trust `match` narrowing.** An exhaustive `ts-pattern` match already narrows the type
  inside each closure; a manual `Extract<>` alias is redundant. (#4201)
- **Exhaustive branching uses `match` from `ts-pattern`.** **(also in AGENTS.md)**
- **No `any`** — proper types or `unknown` + type guards. **(also in AGENTS.md)**

## 6. UI / UX conventions

- **Pending or permission-gated actions render as a dimmed version of the real UI** with
  inline accept/reject controls — not a generic placeholder icon that hides what the
  action does. (#4201)
- **Disclosure carets rotate 180° to point down when expanded**, matching Discussion,
  SplitFileMenu, CollapsibleMessage, etc. (#4582)
- **Truncated/collapsed controls get a tooltip** (matching the app's tooltip pattern) so
  the lost label stays discoverable. (#4492)
- **Semantic color tokens, not raw Tailwind color classes.** **(also in AGENTS.md)**
  The default palette is disabled via `--color-*: initial` in `packages/app/index.css`,
  so raw classes like `text-red-500` silently render *nothing*.
  *Enforced:* ast-grep `tsx-no-raw-tailwind-palette` (CI error) — and `cursor-pointer`
  is flagged by `tsx-no-cursor-pointer`.
- **Prefer composition over configurability**; keep reusable components small and free of
  queries/complex state. **(also in AGENTS.md)**

---

*Provenance: mined 2026-07-09 from human review comments on PRs #3650–#4653 (997 PRs, 315
human inline comments). Regenerate with the review-mining workflow described in
`.github/CODE_REVIEW_AUTOMATION.md`.*
