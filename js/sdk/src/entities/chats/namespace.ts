import type { MacroClient } from '../../utils/client';
import { Chat } from './chat';

export class ChatNamespace {
  constructor(private readonly client: MacroClient) {}

  byId(id: string): Chat {
    return Chat.byId(this.client, id);
  }

  create(opts?: { name?: string; projectId?: string }): Promise<Chat> {
    return Chat.create(this.client, opts);
  }

  search(query: string): AsyncGenerator<Chat> {
    return Chat.search(this.client, query);
  }
}
