import type { BasicDocumentSubType } from '../../../generated/storage/types.gen';
import { unwrap } from '../../utils';
import type { MacroClient } from '../../utils/client';
import { Document } from '../documents/document';
import type { Project } from '../projects/project';
import { entitySearch } from '../search';
import type { Team } from '../teams/team';

type TaskSubType = Extract<BasicDocumentSubType, { type: 'task' }>;

/**
 * A Macro task: a document with sub-type `task`. Inherits the full document
 * surface ({@link Document.rename}, move, delete, restore, content, events)
 * and adds task-specific state.
 */
export class Task extends Document {
  /**
   * Favorites address tasks as their underlying `document` (inherited
   * {@link Document.entityType}), but the properties service gives them their
   * own `TASK` type.
   */
  protected override readonly propertyEntityType = 'TASK';

  /** A handle to a task by document id. Details load on first access. */
  static byId(client: MacroClient, id: string): Task {
    return new Task(client, id);
  }

  /**
   * Create a task. `team` scopes the team task number and may be omitted
   * when the creator belongs to exactly one team; `shareWithTeam` defaults
   * to true.
   */
  static async create(
    client: MacroClient,
    opts: {
      name: string;
      markdown?: string;
      project?: Project;
      team?: Team;
      shareWithTeam?: boolean;
    },
  ): Promise<Task> {
    const { documentId } = unwrap(
      await client.storage.createTaskHandler({
        body: {
          taskName: opts.name,
          markdown: opts.markdown ?? null,
          projectId: opts.project?.id ?? null,
          teamId: opts.team?.id ?? null,
          shareWithTeam: opts.shareWithTeam ?? true,
        },
      }),
    );
    return new Task(client, documentId);
  }

  /** The detail's task variant, or `undefined` if this document is not a task. */
  private async taskSubType(): Promise<TaskSubType | undefined> {
    const { subType } = await this.detail.get();
    return subType?.type === 'task' ? subType : undefined;
  }

  /** Whether the task is completed; `undefined` if the document is not a task. */
  async completed(): Promise<boolean | undefined> {
    return (await this.taskSubType())?.is_completed;
  }

  /** The task's URL in the Macro web app. */
  override webUrl(): string {
    return `${this.client.webAppUrl}/app/task/${this.id}`;
  }

  /** Search tasks by name and content, most relevant first, auto-paginated. */
  static search = entitySearch({
    filters: { document_filters: { sub_types: ['task'], task_filters: {} } },
    type: 'document',
    make: (client, hit) => new Task(client, hit.document_id),
  });
}
