//! `cargo x check [full]` — the single local quality gate: format + lint +
//! code rules. `just check` is a thin delegate to this.
//!
//! Scoped to files changed vs origin/main (merge-base, plus staged/unstaged/
//! untracked work), so the output is exactly "what is wrong with YOUR
//! changes"; legacy findings in untouched files never appear. Every finding is
//! printed as file:line with the rule id, and every failing section names the
//! command that fixes it — the output is meant to be read by (or pasted to)
//! an AI verbatim.
//!
//! - fast tier (default): rustfmt, biome (format + lint, same flags as CI),
//!   oxlint, ast-grep code rules — seconds.
//! - `full`: also runs tsc + clippy — minutes.
//!
//! Rendering goes through the shared [`xtask_stage::Stage`] UI: on a TTY each
//! check animates a spinner that resolves in place to `✓ Done` / `⚠ N
//! warning(s)` / `✗ Failed`; on a non-TTY (CI, AI shells) the resolved lines
//! print plainly and uncolored.
//!
//! Override the diff base with `CHECK_BASE=<ref>`. Exit code is nonzero iff a
//! blocking check fails; warnings and hints are shown but don't block.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::process::Command;
use std::time::Instant;

use anyhow::{Context, Result, bail};
use console::Style;
use xtask_stage::{Stage, format_elapsed};

/// Pinned tool versions: bunx fetches these, so local runs and any future CI
/// use stay aligned without a lockfile entry.
const OXLINT: &str = "oxlint@1.73.0";
const ASTGREP: &str = "@ast-grep/cli@0.44.1";

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let full = match args.iter().map(String::as_str).collect::<Vec<_>>()[..] {
        [] => false,
        ["full"] => true,
        _ => bail!("usage: cargo x check [full]   (env: CHECK_BASE=<ref> overrides the diff base)"),
    };

    let stage = Stage::from_env();
    let repo = xtask_paths::repo_root();
    let changed = changed_files(&repo, &stage)?;
    if changed.is_empty() {
        println!("no changed files — nothing to check");
        return Ok(());
    }

    let js_app: Vec<&str> = changed
        .iter()
        .map(String::as_str)
        .filter(|f| f.starts_with("js/app/") && is_ts(f) && !f.contains("node_modules"))
        .collect();
    let sg: Vec<&str> = changed
        .iter()
        .map(String::as_str)
        .filter(|f| {
            (f.starts_with("rust/") || f.starts_with("js/"))
                && (is_ts(f) || f.ends_with(".rs"))
                && !f.contains("node_modules")
        })
        .collect();
    let rs_cloud_storage = changed
        .iter()
        .any(|f| f.starts_with("rust/cloud-storage/") && f.ends_with(".rs"));
    let rs_sync_service = changed
        .iter()
        .any(|f| f.starts_with("rust/sync-service/") && f.ends_with(".rs"));

    let mut gate = Gate::default();
    if rs_cloud_storage {
        run_check(&stage, "cargo fmt (rust/cloud-storage)", &mut gate, || {
            check_cargo_fmt(&repo, "cloud-storage")
        });
    }
    if rs_sync_service {
        run_check(&stage, "cargo fmt (rust/sync-service)", &mut gate, || {
            check_cargo_fmt(&repo, "sync-service")
        });
    }
    if !js_app.is_empty() {
        run_check(&stage, "biome (js/app format + lint)", &mut gate, || {
            check_biome(&repo, &js_app)
        });
        run_check(&stage, "oxlint", &mut gate, || check_oxlint(&repo, &js_app));
    }
    if !sg.is_empty() {
        run_check(&stage, "ast-grep code rules", &mut gate, || {
            check_ast_grep(&repo, &sg)
        });
    }
    if full {
        if !js_app.is_empty() {
            run_check(&stage, "tsc (js/app)", &mut gate, || check_tsc(&repo));
        }
        if rs_cloud_storage {
            run_check(&stage, "clippy (rust/cloud-storage)", &mut gate, || {
                check_clippy(&repo)
            });
        }
    }

    println!();
    if !gate.blocking.is_empty() {
        let mut line = format!(
            "{} {}",
            Style::new().red().bold().apply_to("FAIL:"),
            gate.blocking.join(" ")
        );
        if !gate.warnings.is_empty() {
            line.push_str(&format!("  ·  warnings: {}", gate.warnings.join(" ")));
        }
        println!("{line}");
        std::process::exit(1);
    }
    if gate.warnings.is_empty() {
        println!("{}", Style::new().green().bold().apply_to("OK"));
    } else {
        println!(
            "{} (with warnings: {})",
            Style::new().green().bold().apply_to("OK"),
            gate.warnings.join(" ")
        );
    }
    if !full {
        println!(
            "{}",
            Style::new()
                .dim()
                .apply_to("(fast tier — 'just check full' adds tsc + clippy)")
        );
    }
    Ok(())
}

/// Accumulated gate state: names of blocking failures and non-blocking
/// warnings, used for the final summary line and the exit code.
#[derive(Default)]
struct Gate {
    blocking: Vec<String>,
    warnings: Vec<String>,
}

/// How a check resolved; the string is the short status shown on its line.
enum Verdict {
    Pass,
    Warn(String),
    Fail(String),
}

/// One check's result: the verdict, per-finding detail lines printed beneath
/// the stage line, an optional dim hint (fix command / guide pointer), and the
/// token used in the final FAIL/OK summary.
struct Outcome {
    verdict: Verdict,
    details: Vec<String>,
    hint: Option<String>,
    token: String,
}

impl Outcome {
    fn pass(token: &str) -> Self {
        Outcome {
            verdict: Verdict::Pass,
            details: Vec::new(),
            hint: None,
            token: token.to_string(),
        }
    }

    fn tool_failure(name: &str, err: &anyhow::Error) -> Self {
        Outcome {
            verdict: Verdict::Fail("Tool failure".into()),
            details: vec![format!("{err:#}")],
            hint: None,
            token: format!("{name}(tool-failure)"),
        }
    }
}

/// Drive one check through the shared stage UI: spinner while `f` runs, then
/// resolve the line to ✓/⚠/✗ with elapsed time, print the hint and detail
/// lines, and record the outcome in the gate.
fn run_check(stage: &Stage, label: &str, gate: &mut Gate, f: impl FnOnce() -> Outcome) {
    let start = Instant::now();
    let spinner = stage.spinner(label);
    let outcome = f();
    let elapsed = format_elapsed(start.elapsed());
    let (marker, status, style) = match &outcome.verdict {
        Verdict::Pass => ("✓", format!("Done {elapsed}"), Style::new().green()),
        Verdict::Warn(s) => ("⚠", format!("{s} {elapsed}"), Style::new().yellow()),
        Verdict::Fail(s) => ("✗", format!("{s} {elapsed}"), Style::new().red()),
    };
    stage.resolve(spinner, stage.line(marker, label, &status, &style));
    if let Some(hint) = &outcome.hint {
        stage.note(&format!("    {hint}"));
    }
    for d in &outcome.details {
        println!("    {d}");
    }
    match outcome.verdict {
        Verdict::Pass => {}
        Verdict::Warn(_) => gate.warnings.push(outcome.token),
        Verdict::Fail(_) => gate.blocking.push(outcome.token),
    }
}

fn is_ts(f: &str) -> bool {
    f.ends_with(".ts") || f.ends_with(".tsx")
}

/// A finished subprocess. `stdout` and `stderr` stay separate so callers that
/// parse structured stdout (ast-grep JSON) aren't corrupted by tool noise on
/// stderr; `output()` joins them for human-facing reporting.
struct Run {
    success: bool,
    stdout: String,
    stderr: String,
}

impl Run {
    fn output(&self) -> String {
        let mut out = self.stdout.clone();
        out.push_str(&self.stderr);
        out
    }
}

/// Run `cmd` with `args` in `cwd`, capturing stdout and stderr. Env pairs are
/// applied on top of the inherited environment.
fn run(cwd: &Path, cmd: &str, args: &[&str], env: &[(&str, &str)]) -> Result<Run> {
    let mut command = Command::new(cmd);
    command.current_dir(cwd).args(args);
    for (k, v) in env {
        command.env(k, v);
    }
    let out = command
        .output()
        .with_context(|| format!("running {cmd} {}", args.join(" ")))?;
    Ok(Run {
        success: out.status.success(),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

fn git(repo: &Path, args: &[&str]) -> Result<Run> {
    run(repo, "git", args, &[])
}

/// The changed-file set this gate is scoped to: committed changes vs the diff
/// base, plus staged, unstaged, and untracked files — deduped, and filtered to
/// paths that still exist.
fn changed_files(repo: &Path, stage: &Stage) -> Result<Vec<String>> {
    #[expect(
        clippy::disallowed_methods,
        reason = "developer-machine tooling, not service runtime config"
    )]
    let base = std::env::var("CHECK_BASE").ok().or_else(|| {
        for upstream in ["origin/main", "main"] {
            if let Ok(r) = git(repo, &["merge-base", "HEAD", upstream])
                && r.success
                && !r.stdout.trim().is_empty()
            {
                return Some(r.stdout.trim().to_string());
            }
        }
        None
    });
    if base.is_none() {
        stage.note("note: cannot find a merge-base with origin/main (shallow clone?);");
        stage.note("      checking uncommitted changes only. Set CHECK_BASE=<ref> to widen.");
    }

    let mut files = BTreeSet::new();
    let mut collect = |r: Run| {
        files.extend(
            r.stdout
                .lines()
                .filter(|l| !l.is_empty())
                .map(str::to_string),
        );
    };
    if let Some(base) = &base {
        let r = git(repo, &["diff", "--name-only", base])?;
        if !r.success {
            bail!("git diff --name-only {base} failed:\n{}", r.output());
        }
        collect(r);
    }
    collect(git(repo, &["diff", "--name-only"])?);
    collect(git(repo, &["diff", "--name-only", "--cached"])?);
    collect(git(repo, &["ls-files", "--others", "--exclude-standard"])?);

    Ok(files
        .into_iter()
        .filter(|f| repo.join(f).is_file())
        .collect())
}

fn check_cargo_fmt(repo: &Path, workspace: &str) -> Outcome {
    let token = format!("cargo fmt (rust/{workspace})");
    let dir = repo.join("rust").join(workspace);
    match run(&dir, "cargo", &["fmt", "--check"], &[]) {
        Ok(r) if r.success => Outcome::pass(&token),
        Ok(r) => {
            let mut diffs: Vec<&str> = r
                .stdout
                .lines()
                .filter_map(|l| l.strip_prefix("Diff in "))
                .map(|l| l.split(':').next().unwrap_or(l))
                .collect();
            diffs.sort_unstable();
            diffs.dedup();
            Outcome {
                verdict: Verdict::Fail("Failed".into()),
                details: diffs.iter().map(|d| d.to_string()).collect(),
                hint: Some(format!("fix: cd rust/{workspace} && cargo fmt")),
                token,
            }
        }
        Err(e) => Outcome::tool_failure(&token, &e),
    }
}

/// Paths passed to tools that run from `js/app`, made relative to it.
fn rel_to_js_app<'a>(files: &[&'a str]) -> Vec<&'a str> {
    files
        .iter()
        .filter_map(|f| f.strip_prefix("js/app/"))
        .collect()
}

fn check_biome(repo: &Path, js_app: &[&str]) -> Outcome {
    // Same flags as the web CI check, minus --changed: the file scope is ours.
    let mut args = vec![
        "--bun",
        "@biomejs/biome",
        "ci",
        "--colors=off",
        "--no-errors-on-unmatched",
        "--error-on-warnings",
    ];
    args.extend(rel_to_js_app(js_app));
    match run(&repo.join("js/app"), "bunx", &args, &[]) {
        Ok(r) if r.success => Outcome::pass("biome"),
        Ok(r) => Outcome {
            verdict: Verdict::Fail("Failed".into()),
            details: r.output().lines().map(str::to_string).collect(),
            hint: Some("fix: cd js && bun run fix, then re-check".into()),
            token: "biome".into(),
        },
        Err(e) => Outcome::tool_failure("biome", &e),
    }
}

fn check_oxlint(repo: &Path, js_app: &[&str]) -> Outcome {
    let mut args = vec!["--yes", OXLINT];
    args.extend(rel_to_js_app(js_app));
    match run(&repo.join("js/app"), "bunx", &args, &[]) {
        Ok(r) => {
            // Finding lines look like `path:line:col: warning promise(...)`.
            let findings: Vec<String> = r
                .stdout
                .lines()
                .map(str::trim_start)
                .filter(|l| is_oxlint_finding(l))
                .map(|l| format!("js/app/{l}"))
                .collect();
            if !r.success {
                Outcome {
                    verdict: Verdict::Fail("Failed".into()),
                    details: r.output().lines().map(str::to_string).collect(),
                    hint: None,
                    token: "oxlint".into(),
                }
            } else if findings.is_empty() {
                Outcome::pass("oxlint")
            } else {
                let n = findings.len();
                Outcome {
                    verdict: Verdict::Warn(format!("{n} warning(s)")),
                    details: findings,
                    hint: Some("non-blocking; see STYLE_GUIDE.md FE-12".into()),
                    token: format!("oxlint({n})"),
                }
            }
        }
        Err(e) => Outcome::tool_failure("oxlint", &e),
    }
}

/// `path.ts:12:3: warning ...` — a colon-separated location prefix with two
/// numeric segments.
fn is_oxlint_finding(line: &str) -> bool {
    let mut parts = line.splitn(4, ':');
    let (Some(path), Some(l), Some(c), Some(_)) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return false;
    };
    !path.is_empty()
        && !path.contains(' ')
        && !l.is_empty()
        && l.chars().all(|c| c.is_ascii_digit())
        && !c.is_empty()
        && c.chars().all(|c| c.is_ascii_digit())
}

fn check_ast_grep(repo: &Path, sg: &[&str]) -> Outcome {
    let mut args = vec!["--yes", ASTGREP, "scan", "--json=compact"];
    args.extend(sg);
    let r = match run(repo, "bunx", &args, &[]) {
        Ok(r) => r,
        Err(e) => return Outcome::tool_failure("ast-grep", &e),
    };
    // bunx may prepend install noise; the JSON payload starts at the first '['.
    let json_start = r.stdout.find('[').unwrap_or(r.stdout.len());
    let findings: Vec<serde_json::Value> = match serde_json::from_str(r.stdout[json_start..].trim())
    {
        Ok(f) => f,
        Err(e) => {
            return Outcome {
                verdict: Verdict::Fail("Tool failure".into()),
                details: vec![format!("ast-grep output unreadable: {e}")],
                hint: None,
                token: "ast-grep(tool-failure)".into(),
            };
        }
    };

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut hints: BTreeMap<String, (usize, BTreeSet<String>)> = BTreeMap::new();
    let mut hint_count = 0usize;
    for f in &findings {
        let sev = f["severity"].as_str().unwrap_or("warning");
        let file = f["file"].as_str().unwrap_or("?");
        let rule = f["ruleId"].as_str().unwrap_or("?");
        let line = f["range"]["start"]["line"].as_u64().unwrap_or(0) + 1;
        let message = f["message"].as_str().unwrap_or("");
        let formatted = format!("{file}:{line} [{rule}] {message}");
        match sev {
            "error" => errors.push(format!("error: {formatted}")),
            "hint" => {
                hint_count += 1;
                let entry = hints.entry(rule.to_string()).or_default();
                entry.0 += 1;
                entry.1.insert(file.to_string());
            }
            _ => warnings.push(format!("warning: {formatted}")),
        }
    }

    let hint_lines: Vec<String> = hints
        .iter()
        .map(|(rule, (count, files))| {
            let shown: Vec<&str> = files.iter().take(3).map(String::as_str).collect();
            let more = if files.len() > 3 { " …" } else { "" };
            format!("hint: {count}x [{rule}] in {}{more}", shown.join(", "))
        })
        .collect();

    let mut details = errors.clone();
    details.extend(warnings.iter().cloned());
    details.extend(hint_lines);
    let hint = Some("rule ids map to STYLE_GUIDE.md".to_string());
    if !errors.is_empty() {
        Outcome {
            verdict: Verdict::Fail(format!("{} error(s)", errors.len())),
            details,
            hint,
            token: "ast-grep".into(),
        }
    } else if !warnings.is_empty() || hint_count > 0 {
        Outcome {
            verdict: Verdict::Warn(format!(
                "{} warning(s), {hint_count} hint(s)",
                warnings.len()
            )),
            details,
            hint,
            token: format!("ast-grep({}w/{hint_count}h)", warnings.len()),
        }
    } else {
        Outcome::pass("ast-grep")
    }
}

fn check_tsc(repo: &Path) -> Outcome {
    match run(&repo.join("js"), "bun", &["run", "check"], &[]) {
        Ok(r) if r.success => Outcome::pass("tsc"),
        Ok(r) => Outcome {
            verdict: Verdict::Fail("Failed".into()),
            details: r.output().lines().map(str::to_string).collect(),
            hint: None,
            token: "tsc".into(),
        },
        Err(e) => Outcome::tool_failure("tsc", &e),
    }
}

fn check_clippy(repo: &Path) -> Outcome {
    // Mirrors the `just clippy` recipe in rust/cloud-storage/justfile.
    let r = run(
        &repo.join("rust/cloud-storage"),
        "cargo",
        &["clippy", "--workspace", "--all-features"],
        &[
            ("RUSTFLAGS", "-Dwarnings -Dclippy::disallowed_methods"),
            ("RUSTDOCFLAGS", "-Dwarnings"),
            ("SQLX_OFFLINE", "true"),
        ],
    );
    match r {
        Ok(r) if r.success => Outcome::pass("clippy"),
        Ok(r) => {
            let combined = r.output();
            let interesting: Vec<&str> = combined
                .lines()
                .filter(|l| {
                    let t = l.trim_start();
                    !t.starts_with("Compiling")
                        && !t.starts_with("Checking")
                        && !t.starts_with("Finished")
                })
                .collect();
            let tail = interesting.len().saturating_sub(100);
            Outcome {
                verdict: Verdict::Fail("Failed".into()),
                details: interesting[tail..].iter().map(|l| l.to_string()).collect(),
                hint: None,
                token: "clippy".into(),
            }
        }
        Err(e) => Outcome::tool_failure("clippy", &e),
    }
}
