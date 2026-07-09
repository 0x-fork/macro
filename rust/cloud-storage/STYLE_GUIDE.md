# Cloud Storage Code Review Style Guide

Conventions that reviewers repeatedly enforce on `rust/cloud-storage` PRs. This file was
produced by mining every human review comment on the last ~1000 PRs (#3650–#4653) and
clustering the recurring, generalizable feedback. PR numbers after each rule link to real
review threads where the rule came up.

**How to use this file**

- Authors: read it before opening a PR; it is the checklist reviewers grade against.
- Reviewers: when you leave the same comment a second time, add the rule here instead of
  typing it a third time.
- Bots: CodeRabbit ingests this file via `knowledge_base.code_guidelines` in
  `.coderabbit.yaml`, so rules added here become automated review comments.

Rules marked **(also in CLAUDE.md)** confirm existing documented guidance — kept here so
this file works as a standalone review checklist.

---

## 1. Database & migrations

- **Generate ids as UUIDv7 in application code.** Do not use `gen_random_uuid()` (UUIDv4)
  in migrations or queries; we prefer manually inserted v7 ids so they sort by creation
  time. (#4296)
- **Make inserts idempotent.** Seed/backfill inserts and anything that can race needs an
  `ON CONFLICT` handler. (#4296, #4498)
- **Prefer natural/composite keys over surrogate ids** when the table is queried/sorted by
  those columns anyway, and key REST routes on the natural id. (#4296, #4498)
- **Name user columns `user_id`**, not `owner_user_id` or other variants — follow the
  naming used by existing tables. (#4498)
- **Be explicit about deletion semantics.** New tables need a deliberate cascade/cleanup
  story, not whatever the default happens to be. (#4296)
- **Don't add redundant indexes** — a column already covered as the leading part of the
  primary key does not need its own index. (#3961)
- **Don't store columns that are implicit in context** (e.g. a scoping id that is already
  fixed per durable object / per tenant). (#3961)
- **Use `sqlx::query!` / `query_as!` (compile-time checked) by default.** The non-macro
  `sqlx::query` is only for queries that genuinely cannot be statically known. (#4156)
  **(also in CLAUDE.md)**
- **`.sqlx` cache lives at the workspace root.** Run `just prepare_db` from
  `rust/cloud-storage`; never commit a `.sqlx` directory inside an individual crate. (#4577)
  **(also in CLAUDE.md)**

## 2. Types: make illegal states unrepresentable

- **Newtype your identifiers and tokens.** Raw `String` ids/tokens/model-ids smell; wrap
  them in a validated newtype that checks shape at construction (e.g. `AnthropicModelId`
  with a regex check, a typed wrapper for `user_token`). (#4020, #4077, #4276)
- **A closed set of string values is an enum**, not a `String` — impl `Display`/`FromStr`
  as needed (e.g. allowed runners). (#4296, #4410)
- **Optional means `Option<T>`.** Don't rely on sentinel values or convention to express
  absence. (#4296)
- **Model tri-state data (not-loaded / missing / present) as one flat enum**, not nested
  `Option`s or ad-hoc flags. (#4527)

## 3. Config, env vars & secrets

- **All env access goes through `macro_env_var` / `macro_config`.** Never `std::env::var`,
  never hand-rolled wrappers. Use `MaybeEnvVar` for optional vars. (#4306, #4334, #4380)
  **(also in CLAUDE.md)** *Enforced:* clippy `disallowed-methods` (`clippy.toml`), along
  with the non-macro `sqlx::query*` ban.
- **Fail fast: validate config at service instantiation**, not deep inside request
  handling. A missing env var should kill startup, not a request. (#4077, #4156)
- **Don't add `.context()` to env-var macro errors.** The macro error already statically
  names the missing variable; extra context is noise. (#4156)
- **Doppler secret key names must exactly match the env var name referenced in code.**
  (#4525)
- **New AI-service secrets are plain env vars**, not `LocalOrRemote`/doppler-wrapped
  secrets — we are moving away from those. Non-secret config goes in Doppler as raw values,
  not AWS Secrets Manager secrets. (#4305, #4525)

## 4. Errors, observability & metering

- **Give third-party errors their own variant.** Don't collapse e.g. a `jsonwebtoken`
  failure into a generic internal error — the caller and the logs need the distinction.
  (#4020)
- **Depending on a rate-limited external provider requires a fallback** (fallback model,
  retry story, or documented degradation). (#4296)
- **Wire usage metering on every invocation path** — MCP-triggered tool calls count too,
  not just the primary path. (#4296)
- Tracing conventions **(also in CLAUDE.md)**: `#[instrument(err)]` only on `Result`
  functions; log errors as structured fields (`tracing::error!(error=?e, "msg")`); prefer
  `.inspect_err` over `if let Err(e)` for logging.

## 5. Architecture & module boundaries

- **Do not grow `macro_db_client`.** New domain logic gets a new crate; the catch-all
  crates must shrink, not accumulate. (#4380)
- **Keep source files under ~1000 lines** — split before a reviewer has to ask. (#4364)
- **`mod.rs` declares submodules; it doesn't host logic.** Move real code into its own
  module file. (#4175)
- **Reuse before reimplementing.** If the logic plausibly exists (service clients,
  permission checks, oauth utils, the `agent` crate), find it and reuse/extract it into a
  shared util instead of writing a second copy. (#3692, #4020, #4380, #4485)
- **Shared domain tables are only touched by their owning crate** — e.g. `entity_access`
  mutations go through `entity_access`/`entity_access_db_utils`, never raw SQL elsewhere.
  (#3769)
- **Don't extract single-use code into shared crates prematurely**, and watch dependency
  direction: general-purpose crates must not import from specific ones (e.g. a `user_id`
  parser importing `bot_id` is backwards). (#4410)
- **Group proliferating root files** (e.g. Dockerfiles) into a dedicated folder. (#4380)

## 6. API & handler design

- **Axum handlers take shared services via `State`, not `Extension`.** (#4556)
  ⚠️ This supersedes the older case-study note in `CLAUDE.md` that said the opposite —
  recent reviews consistently enforce `State`.
  *Enforced:* ast-grep `rust-no-axum-extension-param` (warning on changed code).
- **Attach cross-cutting services to the owning domain service**, not ad hoc at the
  router/handler layer — e.g. `EntityAccessManagementService` hangs off the email/document
  service itself, the way the documents crate does. (#4572)
- **New API/soup models mirror the shape of their existing counterpart.** Omit fields
  derivable from a nested field, keep lazily-loaded collections lazy, and only include
  fields relevant to the new context (e.g. `SoupChannelThread` vs `ApiChannelMessage`).
  (#4165)
- **Trait methods that every implementor must consciously declare get no default impl**
  (e.g. schema version). Defaults are for genuine defaults, not escape hatches. (#4276)
- **Design generic abstractions to map `T -> U`**, not just `T -> T`, when mapping is the
  point of the abstraction. (#4396)
- **Keep sibling endpoints on a resource using the same DTO shape**; migrate them together
  rather than changing one in isolation. (#4386)

## 7. Security & permissions

- **Permission grants are stateless HTTP endpoints, not channel messages.** In-memory
  channel flows don't survive reconnects. (#4201, #4296)
- **Mint narrowly-scoped tokens instead of forwarding the user's full JWT** downstream —
  least privilege by construction. (#4296)
- **Tool responses must be valid members of the message chain** — include `tool_call_id`
  and required chain metadata. (#4296)
- **Pin third-party GitHub Actions to a commit SHA**, not a movable tag. (#4276)

## 8. Rust idioms

- **Repeated literals become named consts** (e.g. an `issuer` string used twice). (#4020)
- **`#[expect(...)]` over `#[allow(...)]`**, placed on the narrowest item it applies to,
  not on `main`/module level. (#4396, #4647)
- **Don't re-state trait bounds already implied by a supertrait.** (#4276)
- **Use the smallest sufficient integer type** — a version counter that can't plausibly
  pass 255 is a `u8`. (#4396)
- **Large inline strings belong in files** — use `include_str!`. (#4156)
- **CLI binaries use `clap`**, not hand-rolled arg parsing. (#3678)
- **Prefer `anyhow::bail!` for early error returns.** **(also in CLAUDE.md)**

## 9. Performance & async

- **Keep latency-critical services thin.** Push bytes directly instead of round-tripping
  through presigned URLs or extra services; dispatch non-blocking background work with
  `wait_until` so it doesn't delay completion. (#3781)
- **Don't do per-message work on hot websocket paths** — accumulate and flush on a
  timer/alarm. (#3961)

## 10. Testing

- **Tests live in a sibling `test.rs`**, not inline `#[cfg(test)]` blocks in the
  implementation file. (#4647) **(also in CLAUDE.md)**
- **Update tests and run `just prepare_db` with any db-crate change.** **(also in CLAUDE.md)**

---

*Provenance: mined 2026-07-09 from human review comments on PRs #3650–#4653 (997 PRs, 315
human inline comments). Regenerate with the review-mining workflow described in
`.github/CODE_REVIEW_AUTOMATION.md`.*
