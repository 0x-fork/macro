import type {
  ChannelType,
  GetChannelAttachmentsResponses,
  GetChannelParticipantsResponses,
  GetChannelResponses,
  TypingAction,
} from '../../../generated/storage/types.gen';
import { type RichMessage, toBody } from '../../mentions';
import { paginate, unwrap } from '../../utils';
import type { MacroClient } from '../../utils/client';
import { PropertiedEntity } from '../entity';
import { entitySearch } from '../search';
import { Message } from './message';

type ChannelDetail = GetChannelResponses[200];

/** A member of a channel, with their role and join time. */
export type ChannelParticipant = GetChannelParticipantsResponses[200][number];

/** A file or entity attached to a message in a channel. */
export type ChannelAttachment =
  GetChannelAttachmentsResponses[200]['items'][number];

/**
 * A channel.
 */
export class Channel extends PropertiedEntity<ChannelDetail> {
  /** Favorites identify channels as `channel`. */
  readonly entityType = 'channel';

  /** The properties service identifies channels as `CHANNEL`. */
  protected readonly propertyEntityType = 'CHANNEL';

  protected async fetch(): Promise<ChannelDetail> {
    return unwrap(
      await this.client.storage.getChannel({ path: { channel_id: this.id } }),
    );
  }

  /** A handle to a channel by id. Details load on first access. */
  static byId(client: MacroClient, id: string): Channel {
    return new Channel(client, id);
  }

  /** Open (creating if needed) the DM channel with a user. */
  static async dm(client: MacroClient, recipientId: string): Promise<Channel> {
    const { channel_id } = unwrap(
      await client.storage.getOrCreateDm({
        body: { recipient_id: recipientId },
      }),
    );
    return new Channel(client, channel_id);
  }

  /** Open (creating if needed) the private group channel with a set of users. */
  static async private(
    client: MacroClient,
    recipientIds: string[],
  ): Promise<Channel> {
    const { channel_id } = unwrap(
      await client.storage.getOrCreatePrivate({
        body: { recipients: recipientIds },
      }),
    );
    return new Channel(client, channel_id);
  }

  /** Create a channel. The caller becomes the owner. */
  static async create(
    client: MacroClient,
    opts: {
      type: ChannelType;
      name?: string;
      /** Participants to add, excluding the owner. */
      participants?: string[];
      /** Team id, for team channels. */
      teamId?: string;
    },
  ): Promise<Channel> {
    const { id } = unwrap(
      await client.storage.createChannel({
        body: {
          channel_type: opts.type,
          name: opts.name ?? null,
          participants: opts.participants ?? [],
          team_id: opts.teamId ?? null,
        },
      }),
    );
    return new Channel(client, id);
  }

  /** The channel's display name, resolved from the viewer's perspective. */
  readonly name = this.field('channel_name');

  /** Post a message. Plain text, or a rich body composed with `msg`. */
  async send(
    body: string | RichMessage,
    opts?: { threadId?: string },
  ): Promise<Message> {
    const { content, mentions } = toBody(body);
    const res = unwrap(
      await this.client.storage.postMessage({
        path: { channel_id: this.id },
        body: {
          content,
          mentions,
          attachments: [],
          thread_id: opts?.threadId ?? null,
          nonce: crypto.randomUUID(),
        },
      }),
    );
    return Message.byId(this.client, this.id, res.id);
  }

  /** The messages in this channel, most recent first, auto-paginated. */
  messages(opts?: { pageSize?: number }): AsyncGenerator<Message> {
    return paginate(async (cursor) => {
      const page = unwrap(
        await this.client.storage.getChannelMessages({
          path: { channel_id: this.id },
          query: {
            ...(opts?.pageSize ? { limit: opts.pageSize } : {}),
            ...(cursor ? { cursor } : {}),
          },
        }),
      );
      return {
        items: page.items.map((m) => Message.from(this.client, m)),
        nextCursor: page.next_cursor,
      };
    });
  }

  /** A handle to a message in this channel by id. */
  message(id: string): Message {
    return Message.byId(this.client, this.id, id);
  }

  /** Rename the channel. */
  async rename(name: string): Promise<void> {
    await this.mutate((c) =>
      c.storage.patchChannel({
        path: { channel_id: this.id },
        body: { channel_name: name },
      }),
    );
  }

  /** Delete the channel. This is not reversible. */
  async delete(): Promise<void> {
    await this.mutate((c) =>
      c.storage.deleteChannel({ path: { channel_id: this.id } }),
    );
  }

  /** Join the channel as the current user. */
  async join(): Promise<void> {
    await this.mutate((c) =>
      c.storage.joinChannel({ path: { channel_id: this.id } }),
    );
  }

  /** Leave the channel as the current user. */
  async leave(): Promise<void> {
    await this.mutate((c) =>
      c.storage.leaveChannel({ path: { channel_id: this.id } }),
    );
  }

  /** The channel's members, with their roles and join times. */
  async participants(): Promise<ChannelParticipant[]> {
    return unwrap(
      await this.client.storage.getChannelParticipants({
        path: { channel_id: this.id },
      }),
    );
  }

  /** Add users to the channel. */
  async addParticipants(userIds: string[]): Promise<void> {
    await this.mutate((c) =>
      c.storage.addParticipants({
        path: { channel_id: this.id },
        body: { participants: userIds },
      }),
    );
  }

  /** Remove users from the channel. */
  async removeParticipants(userIds: string[]): Promise<void> {
    await this.mutate((c) =>
      c.storage.removeParticipants({
        path: { channel_id: this.id },
        body: { participants: userIds },
      }),
    );
  }

  /** Broadcast a typing indicator, optionally scoped to a thread. */
  async typing(
    action: TypingAction,
    opts?: { threadId?: string },
  ): Promise<void> {
    unwrap(
      await this.client.storage.postTyping({
        path: { channel_id: this.id },
        body: { action, thread_id: opts?.threadId ?? null },
      }),
    );
  }

  /** The attachments posted in this channel, auto-paginated. */
  attachments(opts?: {
    pageSize?: number;
    /** Filter by type: `static` for images/videos, `dss` for documents. */
    type?: string;
  }): AsyncGenerator<ChannelAttachment> {
    return paginate(async (cursor) => {
      const page = unwrap(
        await this.client.storage.getChannelAttachments({
          path: { channel_id: this.id },
          query: {
            ...(opts?.pageSize ? { limit: opts.pageSize } : {}),
            ...(opts?.type ? { attachment_type: opts.type } : {}),
            ...(cursor ? { cursor } : {}),
          },
        }),
      );
      return { items: page.items, nextCursor: page.next_cursor };
    });
  }

  /** Search channels by name and content, most relevant first, auto-paginated. */
  static search = entitySearch({
    filters: { channel_filters: {} },
    type: 'channel',
    make: (client, hit) => new Channel(client, hit.channel_id),
  });

  /**
   * Handle an event for this channel. Returns an unsubscribe function.
   */
  on = this.scopedEvents('channel', (m) => m.channel_id);
}
