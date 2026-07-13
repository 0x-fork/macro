import type { Macro } from '@macro/sdk';
import type { GithubIssues, Issue } from './github';
import type { SyncedIssue, SyncStore } from './store';

/**
 * One sync pass: create Macro tasks for unseen issues, then reconcile
 * names bidirectionally. Only writes when a side actually differs from the
 * stored title, so our own writes don't echo back on later passes.
 */
export async function syncOnce(
  macro: Macro,
  github: GithubIssues,
  store: SyncStore,
  githubIssueProperty: string,
): Promise<void> {
  for (const issue of await github.list()) {
    try {
      const synced = await store.get(issue.number);
      if (synced) await reconcileName(macro, github, store, synced, issue);
      else await createTask(macro, store, issue, githubIssueProperty);
    } catch (error) {
      console.error(`issue #${issue.number} failed to sync:`, error);
    }
  }
}

async function createTask(
  macro: Macro,
  store: SyncStore,
  issue: Issue,
  githubIssueProperty: string,
): Promise<void> {
  const task = await macro.tasks.create({
    name: issue.title,
    markdown: `${issue.body ?? ''}\n\n---\nSynced from ${issue.htmlUrl}`,
  });
  await task.setProperty(githubIssueProperty, {
    type: 'link',
    url: issue.htmlUrl,
  });
  await store.insert({
    issueNumber: issue.number,
    taskId: task.id,
    title: issue.title,
  });
  console.log(`#${issue.number} "${issue.title}" -> task ${task.id}`);
}

/**
 * Three-way diff between the GitHub title, the Macro task name, and the
 * title from the last sync. GitHub wins when both sides changed.
 */
async function reconcileName(
  macro: Macro,
  github: GithubIssues,
  store: SyncStore,
  synced: SyncedIssue,
  issue: Issue,
): Promise<void> {
  const task = macro.tasks.byId(synced.taskId);
  const taskName = await task.name();
  if (issue.title !== synced.title) {
    if (taskName !== issue.title) {
      await task.rename(issue.title);
      console.log(`#${issue.number} renamed task to "${issue.title}"`);
    }
    await store.setTitle(issue.number, issue.title);
  } else if (taskName !== undefined && taskName !== synced.title) {
    await github.setTitle(issue.number, taskName);
    await store.setTitle(issue.number, taskName);
    console.log(`#${issue.number} renamed issue to "${taskName}"`);
  }
}
