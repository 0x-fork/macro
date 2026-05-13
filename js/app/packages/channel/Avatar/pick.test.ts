import { ok, err } from '@core/util/maybeResult';
import type OpenAI from 'openai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@service-cognition/client', () => ({
  dcsCompletion: vi.fn(),
}));

import { dcsCompletion } from '@service-cognition/client';

import { FALLBACK_ICON } from './icons';
import { pickAvatar } from './pick';

type DcsResult = Awaited<ReturnType<typeof dcsCompletion>>;

const mocked = vi.mocked(dcsCompletion);

function chatCompletion(content: string): OpenAI.ChatCompletion {
  return {
    id: 'test',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4o-mini',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        logprobs: null,
        message: {
          role: 'assistant',
          content,
          refusal: null,
        },
      },
    ],
  } as OpenAI.ChatCompletion;
}

const okResult = (content: string): DcsResult =>
  ok(chatCompletion(content)) as DcsResult;
const errResult = (): DcsResult =>
  err('NETWORK_ERROR', 'mock failure') as DcsResult;

describe('pickAvatar', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('returns the LLM choice when valid', async () => {
    mocked.mockResolvedValueOnce(
      okResult('{"icon":"rocket","colorFamily":"orange"}')
    );
    const result = await pickAvatar('deploys');
    expect(result).toEqual({ icon: 'rocket', colorFamily: 'orange' });
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it('retries once on invalid JSON, then succeeds', async () => {
    mocked
      .mockResolvedValueOnce(okResult('not json {{{'))
      .mockResolvedValueOnce(okResult('{"icon":"music-notes","colorFamily":"pink"}'));
    const result = await pickAvatar('music-club');
    expect(result).toEqual({ icon: 'music-notes', colorFamily: 'pink' });
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it('retries once on unknown icon, then succeeds', async () => {
    mocked
      .mockResolvedValueOnce(okResult('{"icon":"flying-spaghetti","colorFamily":"orange"}'))
      .mockResolvedValueOnce(okResult('{"icon":"rocket","colorFamily":"orange"}'));
    const result = await pickAvatar('deploys');
    expect(result).toEqual({ icon: 'rocket', colorFamily: 'orange' });
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it('retries once on unknown color, then succeeds', async () => {
    mocked
      .mockResolvedValueOnce(okResult('{"icon":"rocket","colorFamily":"fuchsia"}'))
      .mockResolvedValueOnce(okResult('{"icon":"rocket","colorFamily":"orange"}'));
    const result = await pickAvatar('deploys');
    expect(result).toEqual({ icon: 'rocket', colorFamily: 'orange' });
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it('falls back to chat-circle + hash color after two failures', async () => {
    mocked
      .mockResolvedValueOnce(okResult('{"icon":"???","colorFamily":"???"}'))
      .mockResolvedValueOnce(okResult('garbage'));
    const result = await pickAvatar('marketing');
    expect(result.icon).toBe(FALLBACK_ICON);
    // colorFamily is hash-derived and stable per name
    expect(typeof result.colorFamily).toBe('string');
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it('falls back when the proxy errors twice', async () => {
    mocked.mockResolvedValue(errResult());
    const result = await pickAvatar('engineering');
    expect(result.icon).toBe(FALLBACK_ICON);
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it('skips the LLM entirely for empty/whitespace names', async () => {
    const result = await pickAvatar('   ');
    expect(result).toEqual({ icon: FALLBACK_ICON, colorFamily: 'slate' });
    expect(mocked).not.toHaveBeenCalled();
  });
});
