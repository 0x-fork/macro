import type { WhatsAppParticipant as WhatsAppParticipantRecord } from '../../../generated/storage/types.gen';
import type { WhatsAppGroup } from './group';

/** Someone in an added WhatsApp chat, from its roster; mention them in a text reply. */
export class WhatsAppParticipant {
  private constructor(
    /** The chat whose roster lists them. */
    readonly group: WhatsAppGroup,
    /** Their WhatsApp id: correlation data, not a Macro user. */
    readonly id: string,
    private readonly record?: WhatsAppParticipantRecord,
  ) {}

  /** Reference a participant of a chat by WhatsApp id. */
  static byId(group: WhatsAppGroup, id: string): WhatsAppParticipant {
    return new WhatsAppParticipant(group, id);
  }

  /** Seed a participant from the chat's roster. */
  static from(
    group: WhatsAppGroup,
    record: WhatsAppParticipantRecord,
  ): WhatsAppParticipant {
    return new WhatsAppParticipant(group, record.jid, record);
  }

  /** Their WhatsApp name, untrusted, when the roster had one. */
  get displayName(): string | undefined {
    return this.record?.displayName ?? undefined;
  }

  /** The digits a text reply writes as `@<digits>` to mention them. */
  get mentionToken(): string {
    return this.id.split('@')[0] ?? this.id;
  }

  /** Whether they administer the group, when read from the roster. */
  get admin(): boolean | undefined {
    return this.record?.admin;
  }

  /** Serialize the participant reference without credentials. */
  toJSON() {
    return {
      id: this.id,
      group: this.group.id,
      displayName: this.displayName,
      admin: this.admin,
    };
  }
}
