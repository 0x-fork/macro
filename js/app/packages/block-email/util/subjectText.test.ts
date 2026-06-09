import type { ApiMessage } from '@service-email/generated/schemas';
import { describe, expect, it } from 'vitest';
import { getSubjectText } from './subjectText';

const message = (subject: string | null) => ({ subject }) as ApiMessage;

describe('getSubjectText', () => {
  it('returns empty string without a message', () => {
    expect(getSubjectText(undefined, 'reply')).toBe('');
  });

  it('prefixes replies with Re:', () => {
    expect(getSubjectText(message('Budget'), 'reply')).toBe('Re: Budget');
    expect(getSubjectText(message('Budget'), 'reply-all')).toBe('Re: Budget');
  });

  it('does not stack Re: prefixes, case-insensitively', () => {
    expect(getSubjectText(message('Re: Budget'), 'reply')).toBe('Re: Budget');
    expect(getSubjectText(message('RE: Budget'), 'reply')).toBe('RE: Budget');
    expect(getSubjectText(message('re: Budget'), 'reply-all')).toBe(
      're: Budget'
    );
  });

  it('still prefixes subjects that merely contain "Re:"', () => {
    expect(getSubjectText(message('Talking about Re: budgets'), 'reply')).toBe(
      'Re: Talking about Re: budgets'
    );
  });

  it('prefixes forwards with Fwd:', () => {
    expect(getSubjectText(message('Budget'), 'forward')).toBe('Fwd: Budget');
  });

  it('treats a null subject as empty instead of the string "null"', () => {
    expect(getSubjectText(message(null), 'reply')).toBe('Re: ');
    expect(getSubjectText(message(null), 'forward')).toBe('Fwd: ');
    expect(getSubjectText(message(null), undefined)).toBe('');
  });
});
