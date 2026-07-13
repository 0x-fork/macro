import type { WebhookEvent } from '../generated/storage/types.gen';

export type MacroEvent = WebhookEvent;
export type EventName = MacroEvent['event_type'];
export type EventPayload<E extends EventName> = Extract<
  MacroEvent,
  { event_type: E }
>['metadata'];
export type EventHandler<E extends EventName> = (payload: {
  metadata: EventPayload<E>;
}) => void | Promise<void>;

const VALIDATION_EVENT = 'webhook.validation.test';

type AnyHandler = (event: unknown) => void | Promise<void>;

async function verifySignature(opts: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
}): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(opts.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(`${opts.timestamp}.${opts.rawBody}`),
  );
  return `v1=${new Uint8Array(digest).toHex()}` === opts.signature;
}

/**
 * Webhook receiver. Register one webhook endpoint with Macro and mount this
 * at it to dispatch typed events to registered handlers.
 */
export class MacroEvents {
  private readonly handlers = new Map<EventName, Set<AnyHandler>>();

  constructor(private readonly secret: string) {}

  /** Subscribe to a webhook event. Returns an unsubscribe function. */
  on<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    const set = this.handlers.get(event) ?? new Set<AnyHandler>();
    set.add(handler as AnyHandler);
    this.handlers.set(event, set);
    return () => set.delete(handler as AnyHandler);
  }

  /** Verify, parse, and dispatch a raw delivery. */
  async handle(
    rawBody: string,
    headers: {
      event?: string;
      timestamp?: string;
      signature?: string;
    },
  ): Promise<void> {
    const ok = await verifySignature({
      secret: this.secret,
      timestamp: headers.timestamp ?? '',
      rawBody,
      signature: headers.signature ?? '',
    });
    if (!ok) throw new Error('invalid webhook signature');
    if (headers.event === VALIDATION_EVENT) return;

    const event = JSON.parse(rawBody) as MacroEvent;
    if (!('event_type' in event)) return;
    const set = this.handlers.get(event.event_type);
    if (!set || set.size === 0) return;

    const payload = { metadata: event.metadata };
    await Promise.all([...set].map((h) => h(payload)));
  }

  /** A Fetch-style handler to mount at your webhook route. */
  webhook(): (req: Request) => Promise<Response> {
    return async (req) => {
      await this.handle(await req.text(), {
        event: req.headers.get('x-macro-event') ?? undefined,
        timestamp: req.headers.get('x-macro-timestamp') ?? undefined,
        signature: req.headers.get('x-macro-signature') ?? undefined,
      });
      return new Response('ok');
    };
  }
}
