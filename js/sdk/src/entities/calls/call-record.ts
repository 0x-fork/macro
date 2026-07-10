import type { GetCallRecordResponses } from '../../../generated/storage/types.gen';
import { unwrap } from '../../utils';
import type { MacroClient } from '../../utils/client';
import { FavoritableEntity } from '../entity';
import { entitySearch } from '../search';

type CallRecordDetail = GetCallRecordResponses[200];

/** A Macro call record (an archived, or still active, channel call). */
export class CallRecord extends FavoritableEntity<CallRecordDetail> {
  /** Favorites identify call records as `call`. */
  readonly entityType = 'call';

  protected async fetch(): Promise<CallRecordDetail> {
    return unwrap(
      await this.client.storage.getCallRecord({ path: { call_id: this.id } }),
    );
  }

  /** A handle to a call record by id. Details load on first access. */
  static byId(client: MacroClient, id: string): CallRecord {
    return new CallRecord(client, id);
  }

  /** The call's display name (user-supplied or AI-generated; unset while active). */
  readonly name = this.field('customName');

  /** The id of the channel the call belongs to. */
  readonly channelId = this.field('channelId');

  /** The display name of the channel the call belongs to. */
  readonly channelName = this.field('channelName');

  /** When the call started. */
  readonly startedAt = this.field('startedAt');

  /** When the call ended (undefined if still active). */
  readonly endedAt = this.field('endedAt');

  /** Call duration in milliseconds (undefined if still active). */
  readonly durationMs = this.field('durationMs');

  /** AI-generated summary of the call, once summarization has run. */
  readonly summary = this.field('summary');

  /** Transcript segments, ordered by sequence number. */
  readonly transcript = this.field('transcript');

  /** Participants, both active and historic. */
  readonly participants = this.field('participants');

  /** Rename the call. An empty string clears the custom name. */
  async rename(name: string): Promise<void> {
    await this.mutate((c) =>
      c.storage.editCallRecord({
        path: { call_id: this.id },
        body: { customName: name },
      }),
    );
  }

  /** Delete the call record. */
  async delete(): Promise<void> {
    await this.mutate((c) =>
      c.storage.deleteCallRecord({ path: { call_id: this.id } }),
    );
  }

  /** Search calls by name and transcript, most relevant first, auto-paginated. */
  static search = entitySearch({
    filters: { call_filters: {} },
    type: 'call',
    make: (client, hit) => new CallRecord(client, hit.call_id),
  });
}
