import type { Accessor } from 'solid-js';
import { z } from 'zod';
import { createAIProjection } from './projection';

/** One triaged item surfaced in a "Needs your attention" section. */
export const attentionItemSchema = z.object({
  /** Notification id (inbox variant) — empty for the email variant. */
  notification_id: z.string(),
  /** The entity the item points at: notification target or email thread. */
  entity_type: z.string(),
  entity_id: z.string(),
  /** Short human label for the item (who/what). */
  title: z.string(),
  /** Why this needs attention right now. */
  reason: z.string(),
  /** Concrete next step, phrased as a short imperative. */
  suggested_action: z.string(),
});

export const needsAttentionSchema = z.object({
  items: z.array(attentionItemSchema),
});

export type AttentionItem = z.infer<typeof attentionItemSchema>;

const INBOX_PROMPT = `You are triaging the user's Macro inbox. Call the ListNotifications tool (limit 50) to fetch their active, not-done notifications. Judge which genuinely need the user's attention now: direct mentions and assignments, questions waiting on them, approvals and deadlines, important collaborators. Skip pure FYIs, automated noise, and stale items.

Select between 5 and 10 notifications (fewer only if fewer qualify). For each selected notification, copy id, entityType and entityId EXACTLY from the tool output into notification_id, entity_type and entity_id. Then add:
- title: a short human label for the item — who or what it is (max 60 chars)
- reason: why it needs attention right now (max 140 chars)
- suggested_action: the concrete next step as a short imperative, e.g. "Reply confirming Friday's deadline" (max 80 chars)

Order by importance, most important first. Never invent ids; only use notifications returned by the tool.`;

const EMAIL_PROMPT = `You are triaging the user's email inbox. Call the ListEntities tool with emailPreset "signal", includeTypes ["email"], sortBy "recently_updated" and limit 50 to fetch their most recent signal emails. If a subject alone is not enough to judge importance, you may inspect up to 5 borderline threads with the GetThread tool.

Select the 5 to 10 threads that most need the user's attention: direct questions or requests waiting on their reply, deadlines, approvals, and important senders. Skip newsletters, receipts, and threads where the user was only cc'd on an FYI.

For each selected thread, copy the thread's id EXACTLY from the tool output into entity_id, set entity_type to "email", and set notification_id to "". Then add:
- title: the thread subject, or a short label if the subject is missing (max 60 chars)
- reason: why it needs attention right now (max 140 chars)
- suggested_action: the concrete next step as a short imperative, e.g. "Reply with the signed contract" (max 80 chars)

Order by importance, most important first. Never invent ids; only use threads returned by the tool.`;

export type NeedsAttentionVariant = 'inbox' | 'email';

const VARIANTS: Record<
  NeedsAttentionVariant,
  {
    id: string;
    prompt: string;
    model: string;
  }
> = {
  inbox: {
    id: 'inbox/needs-attention',
    prompt: INBOX_PROMPT,
    // Fast Anthropic tier: the inbox triage weighs several notification kinds,
    // which wants a bit more tool-use judgment than the email pass.
    model: 'anthropic/claude-haiku-4-5',
  },
  email: {
    id: 'email/needs-attention',
    prompt: EMAIL_PROMPT,
    // Single-tool sweep over signal emails; ride the fastest provider.
    model: 'cerebras/gpt-oss-120b',
  },
};

/**
 * "Needs your attention" projection for the inbox or email view: a
 * server-cached, background-refreshed AI triage of the 5-10 items most worth
 * the user's time, with a reason and a suggested next step per item.
 *
 * High cadence + day expiry keeps regeneration frequent; `refresh()`
 * re-triggers on demand. Results stream in over the connection gateway, so
 * the section can render a skeleton and fill in without polling.
 */
export function createNeedsAttentionProjection(
  variant: NeedsAttentionVariant,
  enabled: Accessor<boolean>
) {
  const config = VARIANTS[variant];
  const projection = createAIProjection(() => ({
    id: config.id,
    prompt: config.prompt,
    schema: needsAttentionSchema,
    model: config.model,
    refreshCadence: 'high',
    expiry: 'day',
    awaitGeneration: false,
    enabled: enabled(),
  }));

  const items = (): AttentionItem[] => {
    const data = projection.data();
    if (data === undefined || typeof data === 'string') return [];
    return data.items;
  };

  return {
    /** Triaged items, most important first; [] until a result exists. */
    items,
    /** True while the first generation (or a refresh) is running server-side. */
    isGenerating: projection.isGenerating,
    /** Whether any result (possibly stale) is available yet. */
    hasResult: () => projection.data() !== undefined,
    status: projection.status,
    error: projection.error,
    /** Force a regeneration; stale items stay visible until it lands. */
    refresh: projection.refresh,
  };
}
