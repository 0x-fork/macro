import type { BotWithAgent } from '@service-storage/client';
import { z } from 'zod';

const BOT_MENTIONED_EVENT = 'channel.bot-mentioned' as const;

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const botFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a bot name.').max(128),
    handle: z
      .string()
      .trim()
      .min(1, 'Enter a mention handle.')
      .max(64, 'Mention handle must be 64 characters or fewer.')
      .regex(
        /^[a-z0-9_-]+$/,
        "Use lowercase letters, numbers, '-' or '_' only."
      ),
    description: z.string().trim().max(500),
    avatarUrl: z.string().trim(),
    botType: z.enum(['standard', 'agent']).default('standard'),
    agentMode: z.enum(['macro', 'external']).default('macro'),
    agentEvents: z
      .array(z.literal(BOT_MENTIONED_EVENT))
      .default([BOT_MENTIONED_EVENT]),
    webhookUrl: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    // Agent fields are ignored for standard bots.
    if (values.botType !== 'agent') return;
    if (values.agentEvents.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['agentEvents'],
        message: 'Select at least one event.',
      });
    }
    if (values.agentMode === 'external') {
      if (!values.webhookUrl) {
        ctx.addIssue({
          code: 'custom',
          path: ['webhookUrl'],
          message: 'Enter a webhook endpoint URL.',
        });
      } else if (!isHttpsUrl(values.webhookUrl)) {
        ctx.addIssue({
          code: 'custom',
          path: ['webhookUrl'],
          message: 'Enter a valid https:// URL.',
        });
      }
    } else if (values.webhookUrl) {
      ctx.addIssue({
        code: 'custom',
        path: ['webhookUrl'],
        message: 'Macro agents do not use a webhook URL.',
      });
    }
  });

export type BotFormValues = z.infer<typeof botFormSchema>;
export type BotFormErrors = Partial<Record<keyof BotFormValues, string>>;

export const EMPTY_BOT_FORM: BotFormValues = {
  name: '',
  handle: '',
  description: '',
  avatarUrl: '',
  botType: 'standard',
  agentMode: 'macro',
  agentEvents: [BOT_MENTIONED_EVENT],
  webhookUrl: '',
};

export function botToFormValues(bot: BotWithAgent): BotFormValues {
  return {
    name: bot.name,
    handle: bot.handle,
    description: bot.description ?? '',
    avatarUrl: bot.avatar_url ?? '',
    botType: bot.bot_type === 'agent' ? 'agent' : 'standard',
    agentMode: bot.agent?.mode ?? 'macro',
    agentEvents: bot.agent?.events?.length
      ? bot.agent.events
      : [BOT_MENTIONED_EVENT],
    // The endpoint URL is never returned by the API.
    webhookUrl: '',
  };
}

export function slugBotHandle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function validateBotForm(values: BotFormValues) {
  const result = botFormSchema.safeParse(values);
  if (result.success) return result;

  const fieldErrors = result.error.flatten().fieldErrors;
  return {
    success: false as const,
    errors: Object.fromEntries(
      Object.entries(fieldErrors).map(([field, messages]) => [
        field,
        messages?.[0],
      ])
    ) as BotFormErrors,
  };
}
