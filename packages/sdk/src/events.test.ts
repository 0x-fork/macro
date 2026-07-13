import { describe, expect, it } from 'vitest';
import { MacroEvents } from './events';

// Golden vector produced by the real backend signer, via:
//   cargo run -p webhook --example sign_webhook
// (crates/webhook/examples/sign_webhook.rs). Regenerate this fixture from that
// command if the signing scheme changes — the example self-checks against the
// backend's committed test vector, so a match here proves TS verification is
// byte-for-byte compatible with what Macro actually sends.
const VECTOR = {
  secret: 'test-secret',
  event: 'document.created',
  timestamp: '1700000000',
  body: '{"event_type":"document.created","metadata":{"document_id":"019f5265-463b-7952-9c25-fedd7a0f4b75"}}',
  signature:
    'v1=1f9e6fb25f115322acd830eb18055f14250b682d6191be42494ba0d47b92b985',
} as const;

describe('MacroEvents', () => {
  it('verifies and dispatches a real backend-signed delivery', async () => {
    const events = new MacroEvents(VECTOR.secret);
    let received: unknown;
    events.on(VECTOR.event, ({ metadata }) => {
      received = metadata;
    });

    await events.handle(VECTOR.body, {
      event: VECTOR.event,
      timestamp: VECTOR.timestamp,
      signature: VECTOR.signature,
    });

    expect(received).toEqual({
      document_id: '019f5265-463b-7952-9c25-fedd7a0f4b75',
    });
  });

  it('rejects a tampered body', async () => {
    const events = new MacroEvents(VECTOR.secret);
    await expect(
      events.handle(`${VECTOR.body} `, {
        event: VECTOR.event,
        timestamp: VECTOR.timestamp,
        signature: VECTOR.signature,
      }),
    ).rejects.toThrow('invalid webhook signature');
  });

  it('rejects a wrong secret', async () => {
    const events = new MacroEvents('wrong-secret');
    await expect(
      events.handle(VECTOR.body, {
        event: VECTOR.event,
        timestamp: VECTOR.timestamp,
        signature: VECTOR.signature,
      }),
    ).rejects.toThrow('invalid webhook signature');
  });
});
