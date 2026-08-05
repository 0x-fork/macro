import { describe, expect, it } from 'vitest';
import {
  PREFILL_CAP,
  prefillableTeammates,
  removeInviteSlot,
  validInviteEmails,
  withPrefilledTeammates,
} from './teamInvites';

const contact = (email: string) => ({ email });

describe('prefillableTeammates', () => {
  it('picks the contacts on the suggested domain', () => {
    expect(
      prefillableTeammates({
        contacts: [
          contact('ada@macro.com'),
          contact('grace@other.com'),
          contact('alan@macro.com'),
        ],
        domain: 'macro.com',
        ownEmail: 'me@macro.com',
        slots: ['', ''],
      })
    ).toEqual(['ada@macro.com', 'alan@macro.com']);
  });

  it('never pre-adds the user themselves', () => {
    expect(
      prefillableTeammates({
        contacts: [contact('me@macro.com'), contact('ada@macro.com')],
        domain: 'macro.com',
        ownEmail: 'me@macro.com',
        slots: [],
      })
    ).toEqual(['ada@macro.com']);
  });

  it('skips addresses already in the list and duplicate contacts', () => {
    expect(
      prefillableTeammates({
        contacts: [
          contact('ada@macro.com'),
          contact('ada@macro.com'),
          contact('alan@macro.com'),
        ],
        domain: 'macro.com',
        ownEmail: 'me@macro.com',
        slots: [' ada@macro.com '],
      })
    ).toEqual(['alan@macro.com']);
  });

  it('pre-adds nothing without a suggested domain', () => {
    expect(
      prefillableTeammates({
        contacts: [contact('ada@gmail.com')],
        domain: undefined,
        ownEmail: 'me@gmail.com',
        slots: ['', ''],
      })
    ).toEqual([]);
  });

  it('caps how many teammates get pre-added', () => {
    const contacts = Array.from({ length: PREFILL_CAP + 3 }, (_, i) =>
      contact(`teammate${i}@macro.com`)
    );
    expect(
      prefillableTeammates({
        contacts,
        domain: 'macro.com',
        ownEmail: 'me@macro.com',
        slots: [],
      })
    ).toHaveLength(PREFILL_CAP);
  });
});

describe('withPrefilledTeammates', () => {
  it('absorbs blank starter slots and leaves one row to type in', () => {
    expect(withPrefilledTeammates(['', ''], ['ada@macro.com'])).toEqual([
      'ada@macro.com',
      '',
    ]);
  });

  it('keeps anything already typed above the pre-added teammates', () => {
    expect(
      withPrefilledTeammates(['dev@macro.com', ''], ['ada@macro.com'])
    ).toEqual(['dev@macro.com', 'ada@macro.com', '']);
  });
});

describe('removeInviteSlot', () => {
  it('drops the row at the index', () => {
    expect(removeInviteSlot(['a@macro.com', 'b@macro.com', ''], 1)).toEqual([
      'a@macro.com',
      '',
    ]);
  });

  it('keeps one empty row when the last one goes', () => {
    expect(removeInviteSlot(['a@macro.com'], 0)).toEqual(['']);
  });
});

describe('validInviteEmails', () => {
  it('trims, dedupes, and drops blanks, junk, and the user themselves', () => {
    expect(
      validInviteEmails(
        [' ada@macro.com ', 'ada@macro.com', '', 'nope', 'me@macro.com'],
        'me@macro.com'
      )
    ).toEqual(['ada@macro.com']);
  });
});
