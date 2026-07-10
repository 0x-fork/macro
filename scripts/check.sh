#!/usr/bin/env bash
# just check — the single local quality gate: format + lint + code rules.
#
# Scoped to files changed vs origin/main (merge-base, plus staged/unstaged/
# untracked work), so the output is exactly "what is wrong with YOUR changes";
# legacy findings in untouched files never appear. Every finding is printed as
# file:line with the rule id, and every failing section names the command that
# fixes it — the output is meant to be read by (or pasted to) an AI verbatim.
#
#   just check          fast tier: rustfmt, biome (format+lint), oxlint,
#                       ast-grep code rules      (~seconds)
#   just check full     also runs tsc + clippy   (~minutes)
#
# Override the diff base with CHECK_BASE=<ref> (e.g. CHECK_BASE=HEAD~3).
# Exit code is nonzero iff a blocking check fails. Warnings and hints are
# shown but don't block; errors do.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

MODE="${1:-fast}"
OXLINT="oxlint@1.73.0"
ASTGREP="@ast-grep/cli@0.44.1"

# ---- diff base ---------------------------------------------------------------
BASE="${CHECK_BASE:-}"
if [ -z "$BASE" ]; then
  BASE=$(git merge-base HEAD origin/main 2>/dev/null || true)
fi
if [ -z "$BASE" ]; then
  BASE=$(git merge-base HEAD main 2>/dev/null || true)
fi
if [ -z "$BASE" ]; then
  echo "note: cannot find a merge-base with origin/main (shallow clone?);"
  echo "      checking uncommitted changes only. Set CHECK_BASE=<ref> to widen."
fi

# ---- changed-file set ----------------------------------------------------------
CHANGED=$(mktemp)
trap 'rm -f "$CHANGED"' EXIT
{
  [ -n "$BASE" ] && git diff --name-only "$BASE"
  git diff --name-only
  git diff --name-only --cached
  git ls-files --others --exclude-standard
} | sort -u | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done > "$CHANGED"

changed() { grep -E "$1" "$CHANGED" || true; }

JS_APP_FILES=$(changed '^js/app/.*\.(ts|tsx)$' | grep -v node_modules || true)
SG_FILES=$(changed '^(rust|js)/.*\.(rs|ts|tsx)$' | grep -v node_modules || true)
RS_CS=$(changed '^rust/cloud-storage/.*\.rs$')
RS_SYNC=$(changed '^rust/sync-service/.*\.rs$')

if [ ! -s "$CHANGED" ]; then
  echo "no changed files — nothing to check"
  exit 0
fi

BLOCKING=()
WARNINGS=()
pass() { printf '✓ %s\n' "$1"; }

# ---- 1. rust formatting --------------------------------------------------------
check_fmt() {
  local ws="$1" files="$2"
  [ -z "$files" ] && return 0
  local out rc
  out=$(cd "rust/$ws" && cargo fmt --check 2>&1); rc=$?
  if [ "$rc" -ne 0 ]; then
    printf '✖ cargo fmt (rust/%s) — files need formatting        fix: cd rust/%s && cargo fmt\n' "$ws" "$ws"
    printf '%s\n' "$out" | grep '^Diff in' | sed 's/^Diff in /    /; s/ at line [0-9]*:$//' | sort -u
    BLOCKING+=("cargo fmt (rust/$ws)")
  else
    pass "cargo fmt (rust/$ws)"
  fi
}
check_fmt cloud-storage "$RS_CS"
check_fmt sync-service "$RS_SYNC"

# ---- 2. biome: js format + lint (same flags as CI) -----------------------------
if [ -n "$JS_APP_FILES" ]; then
  rel=$(printf '%s\n' "$JS_APP_FILES" | sed 's|^js/app/||')
  # shellcheck disable=SC2086
  out=$(cd js/app && bunx --bun @biomejs/biome ci --colors=off --no-errors-on-unmatched --error-on-warnings $rel 2>&1); rc=$?
  if [ "$rc" -ne 0 ]; then
    printf '✖ biome (js/app format + lint)        fix: cd js && bun run fix, then re-check\n'
    printf '%s\n' "$out" | sed 's/^/    /'
    BLOCKING+=("biome")
  else
    pass "biome (js/app format + lint)"
  fi
fi

# ---- 3. oxlint: rules biome cannot express (FE-12 etc.) ------------------------
if [ -n "$JS_APP_FILES" ]; then
  rel=$(printf '%s\n' "$JS_APP_FILES" | sed 's|^js/app/||')
  # shellcheck disable=SC2086
  out=$(cd js/app && bunx --yes "$OXLINT" $rel 2>&1); rc=$?
  findings=$(printf '%s\n' "$out" | grep -E '^\s*[^ ]+:[0-9]+:[0-9]+:' || true)
  if [ "$rc" -ne 0 ]; then
    printf '✖ oxlint — errors\n'
    printf '%s\n' "$out" | sed 's/^/    /'
    BLOCKING+=("oxlint")
  elif [ -n "$findings" ]; then
    n=$(printf '%s\n' "$findings" | wc -l | tr -d ' ')
    printf '⚠ oxlint — %s warning(s) in your changed files (non-blocking; see STYLE_GUIDE.md FE-12)\n' "$n"
    printf '%s\n' "$findings" | sed 's|^ *|    js/app/|'
    WARNINGS+=("oxlint($n)")
  else
    pass "oxlint"
  fi
fi

# ---- 4. ast-grep: repo code rules (rule ids map to STYLE_GUIDE.md) -------------
if [ -n "$SG_FILES" ]; then
  SG_JSON=$(mktemp)
  # shellcheck disable=SC2086
  bunx --yes "$ASTGREP" scan --json=compact $SG_FILES 2>/dev/null > "$SG_JSON"
  summary=$(python3 - "$SG_JSON" <<'PYEOF'
import collections
import json
import sys

try:
    with open(sys.argv[1]) as fh:
        content = fh.read()
    findings = json.loads(content[content.find("["):])
except Exception as e:
    print(f"#counts -1 0 0 ast-grep output unreadable: {e}")
    raise SystemExit

by_sev = collections.defaultdict(list)
for f in findings:
    line = f['file'] + ':' + str(f['range']['start']['line'] + 1) \
        + ' [' + f['ruleId'] + '] ' + f['message']
    by_sev[f['severity']].append((f['ruleId'], f['file'], line))
for sev in ('error', 'warning'):
    for _, _, line in by_sev[sev]:
        print(sev + ': ' + line)
hints = collections.defaultdict(list)
for rule, file, _ in by_sev['hint']:
    hints[rule].append(file)
for rule, files in sorted(hints.items()):
    uniq = sorted(set(files))
    shown = ', '.join(uniq[:3]) + (' …' if len(uniq) > 3 else '')
    print('hint: ' + str(len(files)) + 'x [' + rule + '] in ' + shown)
print('#counts', len(by_sev['error']), len(by_sev['warning']), len(by_sev['hint']))
PYEOF
)
  rm -f "$SG_JSON"
  counts=$(printf '%s\n' "$summary" | grep '^#counts' || echo "#counts -1 0 0 no counts emitted")
  summary=$(printf '%s\n' "$summary" | grep -v '^#counts' || true)
  read -r _ n_err n_warn n_hint _ <<< "$counts"
  if [ "${n_err:-0}" -lt 0 ]; then
    printf '✖ ast-grep — tool failure (%s)\n' "$(printf '%s' "$counts" | cut -d' ' -f5-)"
    BLOCKING+=("ast-grep(tool-failure)")
  elif [ "${n_err:-0}" -gt 0 ]; then
    printf '✖ ast-grep code rules — %s error(s) (rule ids map to STYLE_GUIDE.md)\n' "$n_err"
    printf '%s\n' "$summary" | sed 's/^/    /'
    BLOCKING+=("ast-grep")
  elif [ "$((${n_warn:-0} + ${n_hint:-0}))" -gt 0 ]; then
    printf '⚠ ast-grep — %s warning(s), %s hint(s) in your changed files (non-blocking; rule ids map to STYLE_GUIDE.md)\n' "${n_warn:-0}" "${n_hint:-0}"
    printf '%s\n' "$summary" | sed 's/^/    /'
    WARNINGS+=("ast-grep(${n_warn:-0}w/${n_hint:-0}h)")
  else
    pass "ast-grep code rules"
  fi
fi

# ---- 5. slow tier (opt-in) ------------------------------------------------------
if [ "$MODE" = "full" ]; then
  if [ -n "$JS_APP_FILES" ]; then
    out=$(cd js && bun run check 2>&1); rc=$?
    if [ "$rc" -ne 0 ]; then
      printf '✖ tsc (js/app)\n'
      printf '%s\n' "$out" | sed 's/^/    /'
      BLOCKING+=("tsc")
    else
      pass "tsc (js/app)"
    fi
  fi
  if [ -n "$RS_CS" ]; then
    out=$(cd rust/cloud-storage && just clippy 2>&1); rc=$?
    if [ "$rc" -ne 0 ]; then
      printf '✖ clippy (rust/cloud-storage)\n'
      printf '%s\n' "$out" | grep -vE '^\s*(Compiling|Checking|Finished)' | tail -100 | sed 's/^/    /'
      BLOCKING+=("clippy")
    else
      pass "clippy (rust/cloud-storage)"
    fi
  fi
fi

# ---- summary ---------------------------------------------------------------------
echo
if [ "${#BLOCKING[@]}" -gt 0 ]; then
  printf 'FAIL: %s' "${BLOCKING[*]}"
  [ "${#WARNINGS[@]}" -gt 0 ] && printf '  ·  warnings: %s' "${WARNINGS[*]}"
  echo
  exit 1
fi
if [ "${#WARNINGS[@]}" -gt 0 ]; then
  printf 'OK (with warnings: %s)\n' "${WARNINGS[*]}"
else
  echo "OK"
fi
[ "$MODE" != "full" ] && echo "(fast tier — 'just check full' adds tsc + clippy)"
exit 0
