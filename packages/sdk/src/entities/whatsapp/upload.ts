import type { LinkedUploadedAttachment } from '../../../generated/storage/types.gen';
import type { WhatsAppGroup } from './group';

/** A staged attachment scoped to one adopted group; use it in a deliberate media send. */
export class WhatsAppUpload {
  private constructor(
    /** Correlation identity of the staged upload. */
    readonly id: string,
    /** The chat this upload can be sent to. */
    readonly group: WhatsAppGroup,
    /** Display filename supplied by the server. */
    readonly filename?: string,
    /** Media category supplied by the server. */
    readonly kind?: LinkedUploadedAttachment['kind'],
  ) {}

  /** Reference a previously staged upload in its original group. */
  static byId(group: WhatsAppGroup, id: string): WhatsAppUpload {
    return new WhatsAppUpload(id, group);
  }

  /** Seed a handle from the server's upload receipt. */
  static from(
    group: WhatsAppGroup,
    record: LinkedUploadedAttachment,
  ): WhatsAppUpload {
    return new WhatsAppUpload(
      record.uploadId,
      group,
      record.filename,
      record.kind,
    );
  }

  /** Serialize the upload reference without credentials. */
  toJSON() {
    return {
      id: this.id,
      group: this.group.id,
      filename: this.filename,
      kind: this.kind,
    };
  }
}
