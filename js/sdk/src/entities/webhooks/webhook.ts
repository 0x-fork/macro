import type {
  PatchWebhookRequest,
  ValidateWebhookResponse,
  WebhookFilter,
  Webhook as WebhookRecord,
  WebhookScope,
  WebhookStatus,
} from '../../../generated/storage/types.gen';
import { MacroError, unwrap } from '../../utils';
import type { MacroClient } from '../../utils/client';

/**
 * A webhook registration: an HTTPS endpoint Macro delivers signed entity
 * events to.
 *
 * Not a `MacroEntity`: the API has no GET or list endpoint for webhooks, so a
 * lazily-(re)fetched detail record is impossible — a readable instance exists
 * only by holding the record from the create (or latest patch) response,
 * which is what this class does. Favorites and properties don't apply to
 * webhooks either, so none of the base surface would carry over.
 *
 * The API never returns the webhook's signing secret, so deliveries to a
 * webhook registered here cannot yet be verified by `MacroEvents`; pass the
 * secret via `MacroOpts.webhookSecret` once the backend exposes it.
 */
export class Webhook {
  private record: WebhookRecord | null;

  private constructor(
    private readonly client: MacroClient,
    readonly id: string,
    record: WebhookRecord | null,
  ) {
    this.record = record;
  }

  /** Register a webhook. The result is the only readable handle — webhooks cannot be fetched. */
  static async create(
    client: MacroClient,
    opts: {
      url: string;
      name: string;
      filters: WebhookFilter[];
      scope?: WebhookScope;
      headers?: Record<string, string>;
    },
  ): Promise<Webhook> {
    const record = unwrap(
      await client.storage.createWebhook({
        body: {
          endpoint_url: opts.url,
          name: opts.name,
          filters: opts.filters,
          scope: opts.scope ?? 'user',
          ...(opts.headers !== undefined ? { headers: opts.headers } : {}),
        },
      }),
    );
    return new Webhook(client, record.id, record);
  }

  /**
   * A write-only handle to an existing webhook by id: it can patch, delete,
   * and validate, but its fields are unreadable (the API has no GET) until a
   * patch returns the updated record.
   */
  static byId(client: MacroClient, id: string): Webhook {
    return new Webhook(client, id, null);
  }

  /** The held record, or throws for unreadable {@link byId} handles. */
  private requireRecord(): WebhookRecord {
    if (!this.record)
      throw new MacroError(
        `webhook ${this.id} was obtained by id and webhooks cannot be fetched; its fields are unknown until a patch returns the updated record`,
      );
    return this.record;
  }

  /** The webhook's display name. */
  get name(): string {
    return this.requireRecord().name;
  }

  /** The HTTPS endpoint URL deliveries are sent to. */
  get endpointUrl(): string {
    return this.requireRecord().endpoint_url;
  }

  /** The webhook's lifecycle status. */
  get status(): WebhookStatus {
    return this.requireRecord().status;
  }

  /** Whether the current endpoint configuration has passed validation. */
  get isValid(): boolean {
    return this.requireRecord().is_valid;
  }

  /** The event/entity-id filters that gate deliveries. */
  get filters(): WebhookFilter[] {
    return this.requireRecord().filters;
  }

  /** When the webhook was created. */
  get createdAt(): string {
    return this.requireRecord().created_at;
  }

  /** Patch the webhook and hold the updated record the API returns. */
  private async patch(body: PatchWebhookRequest): Promise<void> {
    this.record = unwrap(
      await this.client.storage.patchWebhook({
        path: { webhook_id: this.id },
        body,
      }),
    );
  }

  /** Rename the webhook. */
  async rename(name: string): Promise<void> {
    await this.patch({ name });
  }

  /** Point the webhook at a new HTTPS endpoint URL. */
  async setUrl(url: string): Promise<void> {
    await this.patch({ endpoint_url: url });
  }

  /** Replace the webhook's delivery filters (must be non-empty). */
  async setFilters(filters: WebhookFilter[]): Promise<void> {
    await this.patch({ filters });
  }

  /** Pause deliveries. */
  async pause(): Promise<void> {
    await this.patch({ status: 'paused' });
  }

  /** Resume deliveries. */
  async resume(): Promise<void> {
    await this.patch({ status: 'active' });
  }

  /** Delete the webhook. */
  async delete(): Promise<void> {
    unwrap(
      await this.client.storage.deleteWebhook({
        path: { webhook_id: this.id },
      }),
    );
  }

  /**
   * Send a signed validation test delivery to the endpoint and report whether
   * it was accepted. Note: this does not refresh this handle's `isValid`.
   */
  async validate(): Promise<ValidateWebhookResponse> {
    return unwrap(
      await this.client.storage.validateWebhook({
        path: { webhook_id: this.id },
      }),
    );
  }
}
