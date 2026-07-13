import type { MacroClient } from '@macro/sdk2';
import type { GithubIssues, Issue } from './github';
import type { SyncedIssue, SyncStore } from './store';

/**
 * One sync pass: create Macro tasks for unseen issues, then reconcile
 * names bidirectionally. Only writes when a side actually differs from the
 * stored title, so our own writes don't echo back on later passes.
 */
export async function syncOnce(
  sdk: MacroClient,
  github: GithubIssues,
  store: SyncStore,
  githubIssueProperty: string,
): Promise<void> {
  for (const issue of await github.list()) {
    try {
      const synced = await store.get(issue.number);
      if (synced) await reconcileName(sdk, github, store, synced, issue);
      else await createTask(sdk, store, issue, githubIssueProperty);
    } catch (error) {
      console.error(`issue #${issue.number} failed to sync:`, error);
    }
  }
}

async function createTask(
  sdk: MacroClient,
  store: SyncStore,
  issue: Issue,
  githubIssueProperty: string,
): Promise<void> {
  const { data: task } = await sdk.storage.createTaskHandler({
    body: {
      taskName: issue.title,
      markdown: `${issue.body ?? ''}\n\n---\nSynced from ${issue.htmlUrl}`,
    },
  });
  if (!task) throw new Error('createTaskHandler returned no data');

  await sdk.properties.setEntityProperty({
    path: {
      entity_type: 'DOCUMENT',
      entity_id: task.documentId,
      property_id: githubIssueProperty,
    },
    body: { value: { type: 'link', url: issue.htmlUrl } },
  });

  await store.insert({
    issueNumber: issue.number,
    taskId: task.documentId,
    title: issue.title,
  });
  console.log(`#${issue.number} "${issue.title}" -> task ${task.documentId}`);
}

/**
 * Three-way diff between the GitHub title, the Macro task name, and the
 * title from the last sync. GitHub wins when both sides changed.
 */
async function reconcileName(
  sdk: MacroClient,
  github: GithubIssues,
  store: SyncStore,
  synced: SyncedIssue,
  issue: Issue,
): Promise<void> {
  const { data: doc } = await sdk.storage.getDocument({
    path: { document_id: synced.taskId },
  });
  const taskName = doc?.data.documentMetadata.documentName ?? undefined;

  if (issue.title !== synced.title) {
    if (taskName !== issue.title) {
      await sdk.storage.editDocument({
        path: { document_id: synced.taskId },
        body: { documentName: issue.title },
      });
      console.log(`#${issue.number} renamed task to "${issue.title}"`);
    }
    await store.setTitle(issue.number, issue.title);
  } else if (taskName !== undefined && taskName !== synced.title) {
    await github.setTitle(issue.number, taskName);
    await store.setTitle(issue.number, taskName);
    console.log(`#${issue.number} renamed issue to "${taskName}"`);
  }
}
