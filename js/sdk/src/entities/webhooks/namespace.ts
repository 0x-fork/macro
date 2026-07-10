import type {
  WebhookFilter,
  WebhookScope,
} from '../../../generated/storage/types.gen';
import type { MacroClient } from '../../utils/client';
import { Webhook } from './webhook';

/**
 * Webhook registrations for receiving signed entity-event deliveries.
 *
 * The API never returns a webhook's signing secret, so deliveries to a
 * webhook registered here cannot yet be verified by `MacroEvents`; pass the
 * secret via `MacroOpts.webhookSecret` once the backend exposes it.
 */
export class WebhooksNamespace {
  constructor(private readonly client: MacroClient) {}

  /**
   * Register a webhook. `filters` must be non-empty (each entry matches event
   * names, optionally narrowed to entity ids); `scope` defaults to `'user'`.
   * The returned instance is the only readable handle — there is no GET.
   */
  create(opts: {
    url: string;
    name: string;
    filters: WebhookFilter[];
    scope?: WebhookScope;
    headers?: Record<string, string>;
  }): Promise<Webhook> {
    return Webhook.create(this.client, opts);
  }

  /**
   * A write-only handle to an existing webhook by id: it can patch, delete,
   * and validate, but its fields are unreadable (the API has no GET) until a
   * patch returns the updated record.
   */
  byId(id: string): Webhook {
    return Webhook.byId(this.client, id);
  }
}
