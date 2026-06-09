import type { ApiMessage } from '@service-email/generated/schemas';
import type { ReplyType } from './replyType';

export const getSubjectText = (
  replyingTo: ApiMessage | undefined,
  replyType: ReplyType | undefined
) => {
  if (!replyingTo) return '';
  const subject = replyingTo.subject ?? '';
  if (replyType === 'reply-all' || replyType === 'reply') {
    // Match existing prefixes case-insensitively ("RE:", "re:") so we don't
    // stack prefixes on replies from other clients
    if (/^re:/i.test(subject)) {
      return subject;
    }
    return `Re: ${subject}`;
  } else if (replyType === 'forward') {
    return `Fwd: ${subject}`;
  } else {
    return subject;
  }
};
