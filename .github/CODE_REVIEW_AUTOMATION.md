# Automating Away Repeated Code-Review Comments

## Why this exists

We mined every human review comment on the last ~1000 PRs (#3650–#4653, 2026-07-09):

| Metric | Value |
| --- | --- |
| PRs scanned | 997 |
| PRs with any human inline comment | 83 (~8%) |
| Human inline comments | 315 |
| Bot inline comments (CodeRabbit etc.) | 923 |
| Comments stating a reusable rule | 102 |
| Distinct recurring themes | 19 cloud-storage, 15 frontend |

Two findings drive the design below:

1. **Three reviewers wrote ~80% of the reusable guidance** (whutchinson98 34, synoet 30,
   seanaye 18 of 102 mined rules). Senior reviewers are the bottleneck, and they spend
   that time re-typing the same conventions.
2. **Most repeated feedback is convention, not bug-hunting** — "use the macro", "that
   belongs in the queries package", "newtype that id". Conventions are exactly what bots
   and linters enforce well.

The mined conventions now live in two files, each next to the code it governs:

- [`rust/cloud-storage/STYLE_GUIDE.md`](../rust/cloud-storage/STYLE_GUIDE.md)
- [`js/app/STYLE_GUIDE.md`](../js/app/STYLE_GUIDE.md)

## The system: four layers

### Layer 1 — Feed the guides to the review bot (done in this PR)

`.coderabbit.yaml` → `knowledge_base.code_guidelines.filePatterns` now includes
`**/STYLE_GUIDE.md`. CodeRabbit reads the guides and flags violations on every PR with
zero new infrastructure. The existing `path_instructions` blocks in `.coderabbit.yaml`
stay as short pointers; the guides are the source of truth.

**The contract that keeps this alive:** when a reviewer types the same comment a second
time, the correct move is a one-line PR adding the rule to the STYLE_GUIDE — after that,
the bot says it so the human never has to again.

### Layer 2 — Push mechanizable rules into deterministic tooling

An LLM (or human) should never enforce what a linter can. Tool choices below were
researched and version-verified against the July 2026 state of each ecosystem.

| Job | Tool (verified 2026-07) | Notes |
| --- | --- | --- |
| Ban `std::env::var`, non-macro `sqlx::query*` | clippy `disallowed-methods` | **Already live**: `rust/cloud-storage/clippy.toml` + `-Dclippy::disallowed_methods` in the `just clippy` CI recipe |
| `#[expect]` over `#[allow]` | `[workspace.lints.clippy] allow_attributes = "deny"` + `allow_attributes_without_reason` | Each crate must opt in with `[lints] workspace = true`; add a CI assert that all crates carry the line |
| `axum::Extension` in handler signatures | ast-grep rule scoped to handler fns | clippy `disallowed-types` is too blunt — it would also ban legitimate middleware/layer uses |
| `mod.rs` contains only `mod`/`use`/attrs | ast-grep (first-class Rust grammar) | |
| No `.then()`/`.catch()` chains | oxlint `promise/prefer-await-to-then` | Stable built-in, no type info needed; Biome has **no equivalent rule** |
| No floating promises (explicit fire-and-forget) | oxlint type-aware via `oxlint-tsgolint` | 59/61 ts-eslint type-aware rules, 20–40× faster than ESLint; alpha-labeled but tracks typescript-go, which went GA 2026-07 |
| `service-clients` importable only from `queries` | dependency-cruiser `forbidden` rules | bun symlinks *all* workspace packages regardless of declared deps, so `package.json` alone cannot enforce this; also enable its `no-non-package-json` rule |
| Import cycles / importing own package barrel | Biome `noImportCycles` (stable since 2.4) + dependency-cruiser regex backstop | Biome `noRestrictedImports` is exact-match only (no globs) |
| Raw Tailwind colors vs semantic tokens | Tailwind v4 `@theme`: reset the raw palette (`--color-*: initial`), define only semantic tokens | Make-it-impossible: `bg-red-500` stops compiling; no lint needed |
| Postgres migration safety (locking DDL, NOT NULL adds, non-concurrent indexes…) | squawk via `sbdchd/squawk-action` | Rust binary, ~30 built-in rules, fixed rule set (no plugins) |
| Team SQL rules: no `gen_random_uuid()` (UUIDv7 in app code), ON CONFLICT on backfills, redundant-vs-PK indexes | ~150-line checker on `pg_query.rs` in `tools/xtask` | Same libpg_query parser squawk uses; no off-the-shelf linter is pluggable enough to be worth it (Atlas lint analyzers were paywalled in 2025; sqlfluff plugins = Python overhead) |
| Cross-file PR invariants: Lexical node changed → `version.ts` bumped; new migration → checklist; file crossed 1000 lines; `.sqlx/` inside a crate | Small script + `dorny/paths-filter`, wired as a required status check | The ecosystem's converged pattern; danger-js is in maintenance mode (last stable mid-2025) |
| GitHub Actions pinning + workflow security | zizmor (`unpinned-uses`, injection, excessive permissions, pwn-requests) + actionlint for syntax; Renovate `helpers:pinGitHubActionDigests` for ongoing SHA updates (or one-time `pinact` + Dependabot, which bumps existing SHAs but can't convert tag→SHA) | |

**Standardize custom structural rules on ast-grep.** One root `sgconfig.yml` with a
`rules/` directory is consumed identically by CI (`ast-grep/action`), pre-commit, and
CodeRabbit (`reviews.tools.ast-grep.rule_dirs`) — each rule is written once and enforced
in all three places. Biome's GritQL plugins were evaluated and rejected for this job
(JS/CSS/JSON-only, diagnostic-only); Semgrep CE has fine licensing for private rules but
weaker Rust parsing.

Explicitly rejected after research: **dylint** (each lint pins a nightly toolchain —
maintenance burden unjustified when clippy.toml + ast-grep cover our rules), **Marker**
(stalled since 2023), **Turborepo boundaries** (still experimental, open correctness
bugs), **Atlas lint** (paywalled).

Each rule moved into a linter can then be **deleted from the bot's judgment surface** —
deterministic > probabilistic, and it runs pre-push locally too.

### Layer 3 — A style-guide-scoped AI review pass

CodeRabbit reviews broadly (and produced 3× the comment volume humans did), and per its
docs it **cannot run rules-only** — the general reviewer always runs; path instructions
are a supplement. Two additions give a genuinely rubric-scoped pass:

- **CodeRabbit custom pre-merge checks** (`pre_merge_checks.custom_checks`): one check
  per enumerable guide rule with explicit pass/fail criteria. This is CodeRabbit's only
  truly rule-scoped surface (agentic, read-only, can use ast-grep/ripgrep; results land
  in the summary table). Also: keep the learnings dashboard pruned, and don't list
  guideline files in `path_instructions` (a documented anti-pattern).
- **`anthropics/claude-code-action` v1** in automation mode, where the entire system
  prompt is ours: *"Report ONLY violations of rules written in the STYLE_GUIDE.md files
  for the touched domains; cite the violated rule verbatim; if nothing violates the
  guide, post nothing."* Trigger it on a `style-review` label
  (`pull_request: types: [labeled]` + label guard) so cost is opt-in per PR; cap with
  `--max-turns`. Inline comments via its GitHub inline-comment tool.
- The in-repo `/qc` skill (`.claude/skills/qc`) already runs 5 parallel review agents for
  local pre-push checks; point its "Consistency" agent at the STYLE_GUIDE files so local
  and CI review use the same rubric.

If consolidating to a single AI reviewer ever becomes desirable, Greptile is currently
the only major competitor that treats the rules file as a first-class enforced object
(versioned `.greptile/` rules with per-rule scope/severity and per-rule "last applied"
verification).

### Layer 4 — Re-mine so the guides never go stale

The guides describe the last 1000 PRs; conventions evolve. Re-run the mining quarterly
(or every ~500 PRs):

1. Fan out subagents over PR-number ranges (~25 PRs each); for each PR, fetch review
   threads via the GitHub API/MCP.
2. Drop bot comments; keep human comments that state a generalizable rule; tag each with
   domain (path prefix), category, and a one-line imperative rewrite.
3. Cluster into themes ranked by recurrence; diff against the current STYLE_GUIDE files.
4. Open a PR adding new recurring themes and pruning rules that stopped appearing
   (either adopted — good — or abandoned).

This entire pipeline is what produced the current guides (a Claude Code workflow:
41 harvesters + per-domain clustering, ~25 min wall-clock). A scheduled Claude Code
session (cron trigger) or a manual quarterly run of the same prompt reproduces it.

**Health metric:** human inline comments per PR that restate an existing guide rule.
It should trend toward zero; if a rule keeps being typed by humans anyway, its automated
enforcement (Layer 1–3) isn't working and needs to move down a layer.

## Known doc conflict found during mining

`rust/cloud-storage/CLAUDE.md` ("Case Study" section) says *"Use Extension instead of
State for handlers"*, but recent reviews enforce the opposite (#4556: "This is wrong we
should be using State instead of extension"). The STYLE_GUIDE records `State` as the
convention; the CLAUDE.md case-study note should be corrected by someone who can confirm
the intended pattern.
