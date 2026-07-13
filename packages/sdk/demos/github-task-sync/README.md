# github-task-sync

Demo that mirrors a GitHub repo's issues into Macro tasks using
[`@macro/sdk`](../..), with bidirectional **name** sync: retitle the issue
and the task renames; rename the task and the issue retitles.

Every 60 seconds it:

1. Lists the repo's issues (open and closed, PRs excluded).
2. Creates a Macro task for any issue it hasn't seen, seeding the body from
   the issue.
3. For known issues, three-way diffs the GitHub title and the Macro task
   name against the last-synced title in SQLite and pushes whichever side
   changed (GitHub wins if both did). Diff-before-write keeps our own
   writes from echoing back.

## Setup

```sh
bun install
cp .env.example .env   # fill in MACRO_API_KEY, GITHUB_TOKEN, GITHUB_REPO
bun start
```

The GitHub token should be a fine-grained PAT scoped to the one repo with
Issues read/write.

## Portability

Sync state lives in SQLite behind the two-method `SqlExecutor` interface
(`src/db.ts`). On Cloudflare Workers, swap `bunSqlite()` for a D1-backed
executor and replace `src/main.ts` with a cron-triggered `scheduled()`
handler; `store.ts`, `github.ts`, and `sync.ts` move over unchanged.
