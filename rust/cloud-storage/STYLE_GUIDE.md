# Cloud Storage Code Review Style Guide

Conventions reviewers repeatedly enforce on `rust/cloud-storage` PRs, mined from every
human review comment on PRs #3650–#4653 (997 PRs, 315 human inline comments) and kept
current by adding a rule whenever a reviewer types the same comment twice. CodeRabbit
ingests this file (`knowledge_base.code_guidelines` in `.coderabbit.yaml`), so rules
here become automated review comments.

**Format.** One rule per line: `CS-<id> [scope] rule (evidence · enforcement · docs)`.
IDs are stable — cite them in review comments ("see CS-30"), never renumber or reuse
them; deletions leave gaps and new rules append with the next free number. Scope tags
make the list greppable.

Scopes: `[db]` database & migrations · `[types]` type design · `[cfg]` config, env,
secrets · `[err]` errors & observability · `[arch]` architecture & boundaries · `[api]`
API & handler design · `[sec]` security & permissions · `[rust]` Rust idioms · `[perf]`
performance · `[test]` testing

---

- **CS-01** `[db]` Generate ids as UUIDv7 in application code — never `gen_random_uuid()`
  (UUIDv4); v7 ids sort by creation time. (#4296)
- **CS-02** `[db]` Make seed/backfill inserts and anything that can race idempotent with
  an `ON CONFLICT` handler. (#4296, #4498)
- **CS-03** `[db]` Prefer natural/composite keys over surrogate ids when the table is
  queried/sorted by those columns anyway, and key REST routes on the natural id.
  (#4296, #4498)
- **CS-04** `[db]` Name user columns `user_id` — not `owner_user_id` or other variants;
  follow existing tables. (#4498)
- **CS-05** `[db]` New tables need a deliberate cascade/cleanup story, not whatever the
  default happens to be. (#4296)
- **CS-06** `[db]` Don't add redundant indexes — a column already covered as the leading
  part of the primary key does not need its own index. (#3961)
- **CS-07** `[db]` Don't store columns that are implicit in context (e.g. a scoping id
  already fixed per durable object / per tenant). (#3961)
- **CS-08** `[db]` Use `sqlx::query!` / `query_as!` (compile-time checked) by default;
  the non-macro form is only for queries that genuinely cannot be statically known.
  (#4156 · enforced: clippy `disallowed-methods` · also: CLAUDE.md)
- **CS-09** `[db]` The `.sqlx` cache lives at the workspace root — run `just prepare_db`
  from `rust/cloud-storage`; never commit a `.sqlx` directory inside an individual
  crate. (#4577 · also: CLAUDE.md)
- **CS-10** `[types]` Newtype your identifiers and tokens — wrap raw `String`
  ids/tokens/model-ids in a validated newtype that checks shape at construction.
  (#4020, #4077, #4276)
- **CS-11** `[types]` A closed set of string values is an enum, not a `String` — impl
  `Display`/`FromStr` as needed. (#4296, #4410)
- **CS-12** `[types]` Optional means `Option<T>` — don't rely on sentinel values or
  convention to express absence. (#4296)
- **CS-13** `[types]` Model tri-state data (not-loaded / missing / present) as one flat
  enum, not nested `Option`s or ad-hoc flags. (#4527)
- **CS-14** `[cfg]` All env access goes through `macro_env_var` / `macro_config` — never
  `std::env::var`, never hand-rolled wrappers; use `MaybeEnvVar` for optional vars.
  (#4306, #4334, #4380 · enforced: clippy `disallowed-methods` · also: CLAUDE.md)
- **CS-15** `[cfg]` Fail fast: validate config at service instantiation, not deep inside
  request handling — a missing env var should kill startup, not a request. (#4077, #4156)
- **CS-16** `[cfg]` Don't add `.context()` to env-var macro errors — the macro error
  already statically names the missing variable. (#4156)
- **CS-17** `[cfg]` Doppler secret key names must exactly match the env var name
  referenced in code. (#4525)
- **CS-18** `[cfg]` New AI-service secrets are plain env vars, not
  `LocalOrRemote`/doppler-wrapped; non-secret config goes in Doppler as raw values, not
  AWS Secrets Manager secrets. (#4305, #4525)
- **CS-19** `[err]` Give third-party errors their own variant — don't collapse e.g. a
  `jsonwebtoken` failure into a generic internal error. (#4020)
- **CS-20** `[err]` Depending on a rate-limited external provider requires a fallback
  (fallback model, retry story, or documented degradation). (#4296)
- **CS-21** `[err]` Wire usage metering on every invocation path — MCP-triggered tool
  calls count too, not just the primary path. (#4296)
- **CS-22** `[err]` Tracing: `#[instrument(err)]` only on `Result` functions; log errors
  as structured fields (`tracing::error!(error=?e, "msg")`); prefer `.inspect_err` over
  `if let Err(e)` for logging. (also: CLAUDE.md)
- **CS-23** `[arch]` Do not grow `macro_db_client` — new domain logic gets a new crate;
  the catch-all crates must shrink, not accumulate. (#4380)
- **CS-24** `[arch]` Keep source files under ~1000 lines — split before a reviewer has
  to ask. (#4364)
- **CS-25** `[arch]` `mod.rs` declares submodules; it doesn't host logic — move real
  code into its own module file. (#4175 · enforced: ast-grep
  `rust-mod-rs-declarations-only`, hint)
- **CS-26** `[arch]` Reuse before reimplementing — if the logic plausibly exists
  (service clients, permission checks, oauth utils, the `agent` crate), find it and
  reuse/extract it instead of writing a second copy. (#3692, #4020, #4380, #4485)
- **CS-27** `[arch]` Shared domain tables are only touched by their owning crate — e.g.
  `entity_access` mutations go through `entity_access`/`entity_access_db_utils`, never
  raw SQL elsewhere. (#3769)
- **CS-28** `[arch]` Don't extract single-use code into shared crates prematurely, and
  watch dependency direction: general-purpose crates must not import from specific ones.
  (#4410)
- **CS-29** `[arch]` Group proliferating root files (e.g. Dockerfiles) into a dedicated
  folder. (#4380)
- **CS-30** `[api]` Axum handlers take shared services via `State`, not `Extension`.
  ⚠️ Supersedes the older case-study note in `CLAUDE.md` that said the opposite.
  (#4556 · enforced: ast-grep `rust-no-axum-extension-param`, warning)
- **CS-31** `[api]` Attach cross-cutting services to the owning domain service, not ad
  hoc at the router/handler layer — e.g. `EntityAccessManagementService` hangs off the
  email/document service itself, the way the documents crate does. (#4572)
- **CS-32** `[api]` New API/soup models mirror the shape of their existing counterpart:
  omit fields derivable from a nested field, keep lazily-loaded collections lazy,
  include only fields relevant to the new context. (#4165)
- **CS-33** `[api]` Trait methods every implementor must consciously declare get no
  default impl (e.g. schema version) — defaults are for genuine defaults, not escape
  hatches. (#4276)
- **CS-34** `[api]` Design generic abstractions to map `T -> U`, not just `T -> T`, when
  mapping is the point of the abstraction. (#4396)
- **CS-35** `[api]` Keep sibling endpoints on a resource using the same DTO shape;
  migrate them together rather than changing one in isolation. (#4386)
- **CS-36** `[sec]` Permission grants are stateless HTTP endpoints, not channel
  messages — in-memory channel flows don't survive reconnects. (#4201, #4296)
- **CS-37** `[sec]` Mint narrowly-scoped tokens instead of forwarding the user's full
  JWT downstream — least privilege by construction. (#4296)
- **CS-38** `[sec]` Tool responses must be valid members of the message chain — include
  `tool_call_id` and required chain metadata. (#4296)
- **CS-39** `[sec]` Pin third-party GitHub Actions to a commit SHA, not a movable tag.
  (#4276)
- **CS-40** `[rust]` Repeated literals become named consts. (#4020)
- **CS-41** `[rust]` `#[expect(...)]` over `#[allow(...)]`, placed on the narrowest item
  it applies to. (#4396, #4647)
- **CS-42** `[rust]` Don't re-state trait bounds already implied by a supertrait. (#4276)
- **CS-43** `[rust]` Use the smallest sufficient integer type — a version counter that
  can't plausibly pass 255 is a `u8`. (#4396)
- **CS-44** `[rust]` Large inline strings belong in files — use `include_str!`. (#4156)
- **CS-45** `[rust]` CLI binaries use `clap`, not hand-rolled arg parsing. (#3678)
- **CS-46** `[rust]` Prefer `anyhow::bail!` for early error returns. (also: CLAUDE.md)
- **CS-47** `[perf]` Keep latency-critical services thin: push bytes directly instead of
  round-tripping through presigned URLs or extra services; dispatch non-blocking
  background work with `wait_until`. (#3781)
- **CS-48** `[perf]` Don't do per-message work on hot websocket paths — accumulate and
  flush on a timer/alarm. (#3961)
- **CS-49** `[test]` Tests live in a sibling `test.rs`, not inline `#[cfg(test)]` blocks
  in the implementation file. (#4647 · also: CLAUDE.md)
- **CS-50** `[test]` Update tests and run `just prepare_db` with any db-crate change.
  (also: CLAUDE.md)

---

*Provenance: mined 2026-07-09 from human review comments on PRs #3650–#4653. Next free
id: CS-51.*
