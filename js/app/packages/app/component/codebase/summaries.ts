import { throwOnErr } from '@core/util/result';
import type { GithubPullRequestEntity, TaskEntity } from '@entity';
import { dcsCompletion } from '@service-cognition/client';
import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import {
  buildEngineerDigests,
  buildTeamActivityDigest,
  type EngineerBento,
} from './model';

/**
 * AI summaries for the codebase overview, generated through the DCS
 * completions proxy. Both hooks key their cache on a hash of the underlying
 * activity digest, so summaries only regenerate when the data actually
 * changes; the digests themselves are compact plaintext built in `model.ts`.
 */

const SUMMARY_MODEL = 'anthropic/claude-haiku-4-5';
const SUMMARY_STALE_TIME = 10 * 60 * 1000;
const SUMMARY_GC_TIME = 60 * 60 * 1000;

/** djb2 — stable, tiny; only used to build cache keys from digests. */
function hashDigest(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

async function completeJson<T>(args: {
  system: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const completion = await throwOnErr(() =>
    dcsCompletion({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: args.prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: args.schemaName,
          strict: true,
          schema: args.schema,
        },
      },
    })
  );
  const content = completion.choices[0]?.message?.content ?? '';
  return JSON.parse(content) as T;
}

const TEAM_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['bullets'],
  properties: {
    bullets: {
      type: 'array',
      items: { type: 'string' },
      description: '2-4 short bullets summarizing the day',
    },
  },
};

/**
 * "What the team got done in the last day" — 2-4 bullets over the trailing
 * 24h of merges, opened PRs, and task movement. Disabled when nothing
 * happened; refreshes only when the digest changes.
 */
export function useTeamDailySummaryQuery(
  pullRequests: Accessor<GithubPullRequestEntity[]>,
  tasks: Accessor<TaskEntity[]>
) {
  const digest = () => buildTeamActivityDigest(pullRequests(), tasks());

  return useQuery(() => {
    const { digest: text, eventCount } = digest();
    return {
      queryKey: ['codebase', 'team-daily-summary', hashDigest(text)],
      queryFn: async () => {
        const result = await completeJson<{ bullets: string[] }>({
          system:
            'You summarize a software team’s last 24 hours for their ' +
            'engineering dashboard. Write 2-4 terse, concrete bullets in ' +
            'plain language: lead with what shipped (merged PRs, completed ' +
            'tasks), then what moved. Group related items; name people ' +
            'sparingly; no fluff, no headers, no trailing periods.',
          prompt: text,
          schemaName: 'team_daily_summary',
          schema: TEAM_SUMMARY_SCHEMA,
        });
        return result.bullets;
      },
      enabled: eventCount > 0,
      staleTime: SUMMARY_STALE_TIME,
      gcTime: SUMMARY_GC_TIME,
      retry: 1,
    };
  });
}

const ENGINEER_SUMMARIES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summaries'],
  properties: {
    summaries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'summary'],
        properties: {
          key: { type: 'string' },
          summary: {
            type: 'string',
            description: 'One sentence, max ~20 words',
          },
        },
      },
    },
  },
};

/**
 * One-sentence "recently shipped + currently working on" per engineer,
 * generated in a single batched completion and returned keyed by bento key.
 */
export function useEngineerSummariesQuery(
  bentos: Accessor<EngineerBento[]>,
  pullRequests: Accessor<GithubPullRequestEntity[]>
) {
  const digests = () => buildEngineerDigests(bentos(), pullRequests());

  return useQuery(() => {
    const currentDigests = digests();
    const combined = currentDigests
      .map((d) => `### ${d.key} (${d.displayName})\n${d.digest}`)
      .join('\n\n');

    return {
      queryKey: ['codebase', 'engineer-summaries', hashDigest(combined)],
      queryFn: async () => {
        const result = await completeJson<{
          summaries: Array<{ key: string; summary: string }>;
        }>({
          system:
            'For each engineer, write ONE terse sentence (max ~20 words) ' +
            'covering what they recently shipped and what they’re ' +
            'working on now, based only on the provided PR/task titles. ' +
            'Plain language, no names (the reader sees their card), no ' +
            'fluff. Return one entry per engineer, echoing their key ' +
            'exactly.',
          prompt: combined,
          schemaName: 'engineer_summaries',
          schema: ENGINEER_SUMMARIES_SCHEMA,
        });
        return new Map(
          result.summaries.map((entry) => [entry.key, entry.summary])
        );
      },
      enabled: currentDigests.length > 0,
      staleTime: SUMMARY_STALE_TIME,
      gcTime: SUMMARY_GC_TIME,
      retry: 1,
    };
  });
}
