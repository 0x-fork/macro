# Single local quality gate: format + lint + code rules, scoped to files you
# changed vs origin/main. Output lists every finding as file:line with the
# rule id and the command that fixes it — paste it to an AI verbatim.
#
#   just check        fast: rustfmt + biome + oxlint + ast-grep   (~seconds)
#   just check full   also runs tsc + clippy                      (~minutes)
check *ARGS:
  @bash scripts/check.sh {{ ARGS }}
