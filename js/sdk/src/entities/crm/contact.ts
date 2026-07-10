import type {
  CreateCrmCommentRequest,
  CrmComment,
  CrmCommentThread,
  DeleteCrmCommentResult,
  GetContactResponses,
} from '../../../generated/storage/types.gen';
import { unwrap } from '../../utils';
import type { MacroClient } from '../../utils/client';
import { FavoritableEntity } from '../entity';

type ContactDetail = GetContactResponses[200];

/** A CRM contact: a person observed interacting with the team. */
export class Contact extends FavoritableEntity<ContactDetail> {
  /** Favorites identify CRM contacts as `crm_contact`. */
  readonly entityType = 'crm_contact';

  protected async fetch(): Promise<ContactDetail> {
    return unwrap(
      await this.client.storage.getContact({
        path: { contact_id: this.id },
      }),
    );
  }

  /** A handle to a CRM contact by id. Details load on first access. */
  static byId(client: MacroClient, id: string): Contact {
    return new Contact(client, id);
  }

  /** Build a contact from an API record (pre-seeded, no fetch). */
  static from(client: MacroClient, data: ContactDetail): Contact {
    return new Contact(client, data.id, data);
  }

  /** The contact's display name, if one has been observed. */
  readonly name = this.field('name');

  /** The contact's email address. */
  readonly email = this.field('email');

  /** The id of the CRM company this contact belongs to. */
  readonly companyId = this.field('companyId');

  /** Whether the contact is hidden from CRM listings. */
  readonly hidden = this.field('hidden');

  /** Hide the contact from CRM listings. Display-only; reversible with {@link unhide}. */
  async hide(): Promise<void> {
    await this.setHidden(true);
  }

  /** Un-hide the contact, restoring it to CRM listings. */
  async unhide(): Promise<void> {
    await this.setHidden(false);
  }

  private async setHidden(hidden: boolean): Promise<void> {
    await this.mutate((c) =>
      c.storage.setContactHidden({
        path: { contact_id: this.id },
        body: { hidden },
      }),
    );
  }

  /** The comment threads attached to this contact, with comments oldest first. */
  async comments(): Promise<CrmCommentThread[]> {
    return unwrap(
      await this.client.storage.listCrmComments({
        path: { entity_type: 'crm_contact', entity_id: this.id },
      }),
    );
  }

  /** Add a comment: starts a new thread unless `body.threadId` targets an existing one. */
  async comment(body: CreateCrmCommentRequest): Promise<CrmCommentThread> {
    return this.mutate((c) =>
      c.storage.createCrmComment({
        path: { entity_type: 'crm_contact', entity_id: this.id },
        body,
      }),
    );
  }

  /** Replace a comment's text (markdown). */
  async editComment(commentId: string, text: string): Promise<CrmComment> {
    return this.mutate((c) =>
      c.storage.editCrmComment({
        path: { comment_id: commentId },
        body: { text },
      }),
    );
  }

  /** Soft-delete a comment; the thread goes too when it was the last live one. */
  async deleteComment(commentId: string): Promise<DeleteCrmCommentResult> {
    return this.mutate((c) =>
      c.storage.deleteCrmComment({ path: { comment_id: commentId } }),
    );
  }
}
