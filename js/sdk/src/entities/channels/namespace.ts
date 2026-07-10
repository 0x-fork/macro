import type { ChannelType } from '../../../generated/storage/types.gen';
import type { MacroClient } from '../../utils/client';
import { Channel } from './channel';

export class ChannelNamespace {
  constructor(private readonly client: MacroClient) {}

  byId(id: string): Channel {
    return Channel.byId(this.client, id);
  }

  async dm(recipientId: string): Promise<Channel> {
    return Channel.dm(this.client, recipientId);
  }

  /** Open (creating if needed) the private group channel with a set of users. */
  async private(recipientIds: string[]): Promise<Channel> {
    return Channel.private(this.client, recipientIds);
  }

  /** Create a channel. The caller becomes the owner. */
  async create(opts: {
    type: ChannelType;
    name?: string;
    /** Participants to add, excluding the owner. */
    participants?: string[];
    /** Team id, for team channels. */
    teamId?: string;
  }): Promise<Channel> {
    return Channel.create(this.client, opts);
  }

  search(query: string): AsyncGenerator<Channel> {
    return Channel.search(this.client, query);
  }
}
