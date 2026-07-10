import type { MacroClient } from '../../utils/client';
import { Project } from './project';

export class ProjectNamespace {
  constructor(private readonly client: MacroClient) {}

  byId(id: string): Project {
    return Project.byId(this.client, id);
  }

  create(opts: { name: string; parentId?: string }): Promise<Project> {
    return Project.create(this.client, opts);
  }

  search(query: string): AsyncGenerator<Project> {
    return Project.search(this.client, query);
  }
}
