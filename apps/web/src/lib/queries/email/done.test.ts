import { describe, expect, it } from 'vitest';
import { isEmailThreadDone } from './done';

describe('isEmailThreadDone', () => {
  it('is done when an inbound thread left the inbox', () => {
    expect(
      isEmailThreadDone({ inboxVisible: false, hasInboundMessage: true })
    ).toBe(true);
  });

  it('is not done while the thread is in the inbox', () => {
    expect(
      isEmailThreadDone({ inboxVisible: true, hasInboundMessage: true })
    ).toBe(false);
  });

  it('is not done for a sent-only thread', () => {
    // Never in the inbox and never marked done — it just has no inbound mail.
    expect(
      isEmailThreadDone({ inboxVisible: false, hasInboundMessage: false })
    ).toBe(false);
  });

  it('is not done for a draft-only thread in the inbox', () => {
    expect(
      isEmailThreadDone({ inboxVisible: true, hasInboundMessage: false })
    ).toBe(false);
  });
});
