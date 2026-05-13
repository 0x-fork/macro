import { isErr } from '@core/util/maybeResult';
import { dcsCompletion } from '@service-cognition/client';
import type OpenAI from 'openai';

import { deterministicColorFromName } from './hash';
import { FALLBACK_ICON, ICON_NAMES, isKnownIcon } from './icons';
import {
  COLOR_FAMILIES,
  isColorFamily,
  type ColorFamily,
} from './palette';

export type PickedAvatar = {
  icon: string;
  colorFamily: ColorFamily;
};

const MODEL: OpenAI.ChatModel | (string & {}) = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You select icons for chat channel avatars. Given a channel name, return exactly one icon name from the provided list, plus a color family from the provided list.

Selection rules:
- Pick a concrete, recognizable noun when the channel name suggests one (e.g. "design-team" → "palette", "deploys" → "rocket", "music-club" → "music-notes").
- For generic or ambiguous names ("general", "random", "team", "stuff", "off-topic", single letters, gibberish), pick a neutral icon: "chat-circle", "hash", "users", or "sparkle".
- Do NOT pick icons depicting weapons, violence, drugs, religious symbols, or politically charged imagery, even if the name suggests them.
- Prefer common, instantly-recognizable icons over obscure ones. If you're unsure whether the icon name exists, fall back to a neutral one.

Color family selection:
- Pick a color that feels topically appropriate (e.g. "green" for plants, "blue" for water/tech, "orange" for fire/energy, "purple" for creative).
- For neutral icons, pick "slate" or "neutral".

Output strictly as JSON: {"icon": "icon-name", "colorFamily": "color"}
No prose, no markdown, no code fences.

Valid icons: ${ICON_NAMES.join(', ')}
Valid color families: ${COLOR_FAMILIES.join(', ')}`;

const RESPONSE_FORMAT: OpenAI.ResponseFormatJSONSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'channel_avatar',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['icon', 'colorFamily'],
      properties: {
        icon: { type: 'string' },
        colorFamily: { type: 'string' },
      },
    },
  },
};

function fallback(name: string): PickedAvatar {
  return { icon: FALLBACK_ICON, colorFamily: deterministicColorFromName(name) };
}

function parseAndValidate(content: string): PickedAvatar | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const icon = (parsed as { icon?: unknown }).icon;
  const colorFamily = (parsed as { colorFamily?: unknown }).colorFamily;
  if (!isKnownIcon(icon) || !isColorFamily(colorFamily)) return null;
  return { icon, colorFamily };
}

async function callLLM(name: string): Promise<string | null> {
  const result = await dcsCompletion({
    model: MODEL,
    temperature: 0,
    max_tokens: 60,
    response_format: RESPONSE_FORMAT,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Channel name: "${name}"` },
    ],
  });
  if (isErr(result)) return null;
  return result[1].choices[0]?.message?.content ?? null;
}

/**
 * Pick an icon + color family for a channel name via the LLM.
 *
 * Idempotent and deterministic up to model drift. Falls back to chat-circle +
 * hash-derived color on any failure. Caller is responsible for caching results
 * so we don't repeat the LLM call.
 */
export async function pickAvatar(name: string): Promise<PickedAvatar> {
  const trimmed = name.trim();
  if (!trimmed) return { icon: FALLBACK_ICON, colorFamily: 'slate' };

  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await callLLM(trimmed);
    if (content) {
      const picked = parseAndValidate(content);
      if (picked) return picked;
    }
  }
  return fallback(trimmed);
}
