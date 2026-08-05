import { emailDomain, isPlausibleEmail } from './shared';

/** The invite rows a fresh create-team form starts with. */
export const INITIAL_INVITE_SLOTS = ['', ''];

/** How many same-domain teammates we pre-add to the invite list. */
export const PREFILL_CAP = 6;

/**
 * Same-domain teammates worth pre-adding to the invite list: the user's
 * contacts on `domain`, minus themselves and anyone already listed, capped.
 *
 * Empty when the domain isn't team-worthy (the server decides that) or
 * contacts haven't loaded — callers treat that as "nothing to prefill yet".
 */
export function prefillableTeammates(args: {
  contacts: { email: string }[];
  domain: string | undefined;
  ownEmail: string | undefined;
  slots: string[];
}): string[] {
  const { contacts, domain, ownEmail, slots } = args;
  if (!domain) return [];
  const taken = new Set(slots.map((value) => value.trim()));
  const seen = new Set<string>();
  return contacts
    .filter((contact) => {
      if (contact.email === ownEmail) return false;
      if (emailDomain(contact.email) !== domain) return false;
      if (taken.has(contact.email) || seen.has(contact.email)) return false;
      seen.add(contact.email);
      return true;
    })
    .map((contact) => contact.email)
    .slice(0, PREFILL_CAP);
}

/**
 * The invite list after pre-adding `teammates`: anything already typed stays
 * (in order), the teammates follow, and one empty row trails so there's
 * always somewhere to type. Blank starter slots are absorbed.
 */
export function withPrefilledTeammates(
  slots: string[],
  teammates: string[]
): string[] {
  const typed = slots.filter((value) => value.trim() !== '');
  return [...typed, ...teammates, ''];
}

/**
 * Drops row `index`, keeping at least one (empty) row so the form never loses
 * its input.
 */
export function removeInviteSlot(slots: string[], index: number): string[] {
  const next = slots.filter((_, i) => i !== index);
  return next.length > 0 ? next : [''];
}

/** Deduped, plausible addresses that aren't the user's own. */
export function validInviteEmails(
  slots: string[],
  ownEmail: string | undefined
): string[] {
  return [...new Set(slots.map((value) => value.trim()))].filter(
    (value) => isPlausibleEmail(value) && value !== ownEmail
  );
}
