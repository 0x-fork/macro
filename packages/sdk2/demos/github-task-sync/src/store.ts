import type { SqlExecutor } from './db';

/** The last-synced state of one GitHub issue / Macro task pair. */
export interface SyncedIssue {
  issueNumber: number;
  taskId: string;
  /** Title as of the last successful sync; the base for three-way diffs. */
  title: string;
}

/** Sync state for a single repository, keyed by issue number. */
export class SyncStore {
  constructor(
    private readonly db: SqlExecutor,
    private readonly repo: string,
  ) {}

  async init(): Promise<void> {
    await this.db.run(
      `CREATE TABLE IF NOT EXISTS synced_issues (
        repo TEXT NOT NULL,
        issue_number INTEGER NOT NULL,
        task_id TEXT NOT NULL,
        title TEXT NOT NULL,
        PRIMARY KEY (repo, issue_number)
      )`,
    );
  }

  async get(issueNumber: number): Promise<SyncedIssue | undefined> {
    const rows = await this.db.all<{ task_id: string; title: string }>(
      'SELECT task_id, title FROM synced_issues WHERE repo = ? AND issue_number = ?',
      [this.repo, issueNumber],
    );
    const row = rows[0];
    return row && { issueNumber, taskId: row.task_id, title: row.title };
  }

  async insert(entry: SyncedIssue): Promise<void> {
    await this.db.run(
      'INSERT INTO synced_issues (repo, issue_number, task_id, title) VALUES (?, ?, ?, ?)',
      [this.repo, entry.issueNumber, entry.taskId, entry.title],
    );
  }

  async setTitle(issueNumber: number, title: string): Promise<void> {
    await this.db.run(
      'UPDATE synced_issues SET title = ? WHERE repo = ? AND issue_number = ?',
      [title, this.repo, issueNumber],
    );
  }
}
