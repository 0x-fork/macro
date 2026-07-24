import type { ItemMention } from '@core/component/LexicalMarkdown/plugins';
import { describe, expect, it } from 'vitest';
import { buildPostMessageRequest } from '../message-payload';

const snap = (mentions: ItemMention[]) => ({
  value: '',
  mentions,
  attachments: [],
});

describe('buildPostMessageRequest — @here expansion', () => {
  it('deduplicates @here expansion against an earlier explicit user mention', () => {
    const result = buildPostMessageRequest({
      snapshot: snap([
        { itemType: 'user', itemId: 'user-a' },
        { itemType: 'group', itemId: 'here', groupAlias: 'here' },
      ]),
      participantIds: ['user-a', 'user-b'],
    });

    // user-a should appear once (from the explicit mention), user-b from @here
    expect(result.mentions).toEqual([
      { entity_type: 'user', entity_id: 'user-a' },
      { entity_type: 'user', entity_id: 'user-b' },
    ]);
  });

  it('preserves non-user mentions when mixed with @here', () => {
    const result = buildPostMessageRequest({
      snapshot: snap([
        { itemType: 'document', itemId: 'doc-1' },
        { itemType: 'group', itemId: 'here', groupAlias: 'here' },
        { itemType: 'document', itemId: 'doc-1' },
      ]),
      participantIds: ['user-a'],
    });

    // Documents are not deduped (no user-id semantics), @here expands to user-a
    expect(result.mentions).toEqual([
      { entity_type: 'document', entity_id: 'doc-1' },
      { entity_type: 'user', entity_id: 'user-a' },
      { entity_type: 'document', entity_id: 'doc-1' },
    ]);
  });

  it('deduplicates explicit user mention against earlier @here expansion', () => {
    const result = buildPostMessageRequest({
      snapshot: snap([
        { itemType: 'group', itemId: 'here', groupAlias: 'here' },
        { itemType: 'user', itemId: 'user-a' },
      ]),
      participantIds: ['user-a', 'user-b'],
    });

    // user-a and user-b from @here; trailing explicit user-a skipped
    expect(result.mentions).toEqual([
      { entity_type: 'user', entity_id: 'user-a' },
      { entity_type: 'user', entity_id: 'user-b' },
    ]);
  });

  it('produces no user mentions when @here is used with empty participants', () => {
    const result = buildPostMessageRequest({
      snapshot: snap([
        { itemType: 'group', itemId: 'here', groupAlias: 'here' },
      ]),
    });

    expect(result.mentions).toEqual([]);
  });
});

describe('buildPostMessageRequest — bot re-tagging', () => {
  it('re-tags bot-principal mentions as bot mentions', () => {
    const result = buildPostMessageRequest({
      snapshot: snap([
        {
          itemType: 'user',
          itemId: 'bot|11111111-2222-4333-8444-555555555555',
        },
        { itemType: 'user', itemId: 'macro|alice@example.com' },
      ]),
      participantIds: [],
    });

    expect(result.mentions).toEqual([
      {
        entity_type: 'bot',
        entity_id: 'bot|11111111-2222-4333-8444-555555555555',
      },
      { entity_type: 'user', entity_id: 'macro|alice@example.com' },
    ]);
  });

  it('does not fan bots into @here expansion', () => {
    // Participant ids never contain bot principals (the participants endpoint
    // filters them), but guard the expansion contract anyway.
    const result = buildPostMessageRequest({
      snapshot: snap([
        { itemType: 'group', itemId: 'here', groupAlias: 'here' },
      ]),
      participantIds: ['user-a'],
    });

    expect(result.mentions).toEqual([
      { entity_type: 'user', entity_id: 'user-a' },
    ]);
  });
});
