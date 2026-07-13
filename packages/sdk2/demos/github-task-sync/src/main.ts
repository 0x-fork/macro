import { MacroClient } from '@macro/sdk2';
import { bunSqlite } from './db';
import { env } from './env';
import { GithubIssues } from './github';
import { ensureGithubIssueProperty } from './property';
import { SyncStore } from './store';
import { syncOnce } from './sync';

const [owner, name] = env.GITHUB_REPO.split('/');
if (!owner || !name)
  throw new Error(`GITHUB_REPO must be "owner/name", got "${env.GITHUB_REPO}"`);

const sdk = new MacroClient({ token: env.MACRO_API_KEY, env: env.MACRO_ENV });
const github = new GithubIssues(env.GITHUB_TOKEN, owner, name);
const store = new SyncStore(bunSqlite(env.SYNC_DB_PATH), env.GITHUB_REPO);
await store.init();
const githubIssueProperty = await ensureGithubIssueProperty(sdk);

const run = () =>
  syncOnce(sdk, github, store, githubIssueProperty).catch((error) =>
    console.error('sync pass failed:', error),
  );

console.log(`syncing ${env.GITHUB_REPO} every ${env.REFRESH_SECS}s`);
await run();
setInterval(run, env.REFRESH_SECS * 1000);
