import { describe, expect, it } from 'vitest';
import {
  type BotFormValues,
  EMPTY_BOT_FORM,
  slugBotHandle,
  validateBotForm,
} from '../botForm';

const VALID_PROFILE = {
  name: 'Release bot',
  handle: 'release-bot',
  description: '',
  avatarUrl: '',
} satisfies Partial<BotFormValues>;

describe('bot form', () => {
  it('turns a display name into a valid mention handle', () => {
    expect(slugBotHandle('  Release Updates!  ')).toBe('release-updates');
    expect(slugBotHandle('Build__Bot')).toBe('build__bot');
  });

  it('normalizes valid form values', () => {
    const result = validateBotForm({
      ...EMPTY_BOT_FORM,
      name: '  Release bot  ',
      handle: ' release-bot ',
      description: '  Posts releases  ',
      avatarUrl: '  https://example.com/avatar.png  ',
    });

    expect(result).toEqual({
      success: true,
      data: {
        name: 'Release bot',
        handle: 'release-bot',
        description: 'Posts releases',
        avatarUrl: 'https://example.com/avatar.png',
        botType: 'standard',
        agentMode: 'macro',
        agentEvents: ['channel.bot-mentioned'],
        webhookUrl: '',
      },
    });
  });

  it('returns field-specific errors', () => {
    const result = validateBotForm({
      ...EMPTY_BOT_FORM,
      name: '',
      handle: 'Invalid Handle',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.name).toBe('Enter a bot name.');
    expect(result.errors.handle).toBe(
      "Use lowercase letters, numbers, '-' or '_' only."
    );
  });

  it('accepts an external agent with an https webhook URL', () => {
    const result = validateBotForm({
      ...EMPTY_BOT_FORM,
      ...VALID_PROFILE,
      botType: 'agent',
      agentMode: 'external',
      webhookUrl: 'https://example.com/macro/events',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.botType).toBe('agent');
    expect(result.data.agentMode).toBe('external');
    expect(result.data.agentEvents).toEqual(['channel.bot-mentioned']);
    expect(result.data.webhookUrl).toBe('https://example.com/macro/events');
  });

  it('requires a webhook URL for external agents', () => {
    const result = validateBotForm({
      ...EMPTY_BOT_FORM,
      ...VALID_PROFILE,
      botType: 'agent',
      agentMode: 'external',
      webhookUrl: '',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.webhookUrl).toBe('Enter a webhook endpoint URL.');
  });

  it('rejects non-https webhook URLs for external agents', () => {
    const result = validateBotForm({
      ...EMPTY_BOT_FORM,
      ...VALID_PROFILE,
      botType: 'agent',
      agentMode: 'external',
      webhookUrl: 'http://example.com/macro/events',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.webhookUrl).toBe('Enter a valid https:// URL.');
  });

  it('rejects a webhook URL on macro agents', () => {
    const result = validateBotForm({
      ...EMPTY_BOT_FORM,
      ...VALID_PROFILE,
      botType: 'agent',
      agentMode: 'macro',
      webhookUrl: 'https://example.com/macro/events',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.webhookUrl).toBe(
      'Macro agents do not use a webhook URL.'
    );
  });

  it('ignores agent fields for standard bots', () => {
    const result = validateBotForm({
      ...EMPTY_BOT_FORM,
      ...VALID_PROFILE,
      botType: 'standard',
      agentMode: 'external',
      webhookUrl: 'not-a-url',
    });

    expect(result.success).toBe(true);
  });
});
