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

An LLM (or human) should never enforce what a linter can. Candidates from the mined data,
roughly in order of value:

| Mined rule | Deterministic enforcement |
| --- | --- |
| No `std::env::var` (use `macro_env_var`) | `clippy.toml` `disallowed-methods` |
| `#[expect]` over `#[allow]` | `-W clippy::allow_attributes` (workspace lints) |
| No `gen_random_uuid()` in new migrations | CI grep over `migrations/**` in changed files |
| No `.sqlx/` directory inside individual crates | CI check on changed paths |
| Source files under ~1000 lines | small CI script over changed `.rs`/`.ts(x)` files |
| No service-client imports outside `queries` package | ast-grep rule (CodeRabbit already runs ast-grep: `tools.ast-grep.essential_rules: true`; add a repo `sgconfig.yml` with custom rules) |
| No `.then()` chains in app code | ast-grep rule |
| No raw Tailwind color classes | ast-grep/Biome plugin rule over class strings |
| Pin third-party GitHub Actions to SHAs | `actionlint` / zizmor in CI |

Each rule moved into a linter can then be **deleted from the bot's judgment surface** —
deterministic > probabilistic, and it runs pre-push locally too.

### Layer 3 — A style-guide-scoped AI review pass

CodeRabbit reviews broadly (and produced 3× the comment volume humans did). For a
high-precision pass scoped to *our* conventions, run Claude with the style guide as the
only rubric:

- **Trigger:** GitHub Action on `pull_request` (or on a `claude-review` label to control
  cost), using `anthropics/claude-code-action`.
- **Prompt shape:** "Here is the diff. Here is the STYLE_GUIDE.md for each touched
  domain. Report only violations of these written rules, with the rule quoted. If nothing
  violates the guide, say nothing." Restricting to written rules keeps precision high and
  keeps the bot from re-litigating taste.
- The in-repo `/qc` skill (`.claude/skills/qc`) already runs 5 parallel review agents for
  local pre-push checks; point its "Consistency" agent at the STYLE_GUIDE files so local
  and CI review use the same rubric.

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
