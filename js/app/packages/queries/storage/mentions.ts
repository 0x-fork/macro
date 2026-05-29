import { ENABLE_MENTION_TRACKING } from '@core/constant/featureFlags';
import { throwOnErr } from '@core/util/result';
import { type MutationCallbacks, withCallbacks } from '@queries/utils';
import { type ItemType, storageServiceClient } from '@service-storage/client';
import { useMutation } from '@tanstack/solid-query';

export type CreateEntityMentionVars = {
  sourceId: string;
  targetType: ItemType | 'user';
  targetId: string;
};

export type TrackMentionFn = (
  sourceId: string,
  targetType: ItemType | 'user',
  targetId: string
) => Promise<string | undefined>;

/** Mutation for tracking a document mention. */
export function createEntityMentionMutation(
  callbacks?: MutationCallbacks<string, Error, CreateEntityMentionVars>
) {
  return useMutation<string, Error, CreateEntityMentionVars>(() => ({
    mutationFn: async ({ sourceId, targetType, targetId }) =>
      (
        await throwOnErr(() =>
          storageServiceClient.createEntityMention({
            source_entity_type: 'document',
            source_entity_id: sourceId,
            entity_type: targetType,
            entity_id: targetId,
          })
        )
      ).id,
    ...withCallbacks<string, Error, CreateEntityMentionVars>(
      {
        onError(error) {
          console.error('Failed to track document mention', error);
        },
      },
      callbacks
    ),
  }));
}

/**
 * Returns a function that tracks a document mention via the mutation. Call this
 * in an owner scope; the returned function can be invoked later from event
 * handlers.
 */
export function useTrackMention(): TrackMentionFn {
  const mutation = createEntityMentionMutation();

  return async (sourceId, targetType, targetId) => {
    if (!ENABLE_MENTION_TRACKING) return;
    try {
      return await mutation.mutateAsync({ sourceId, targetType, targetId });
    } catch {
      // Logged by the mutation's onError; don't block the caller.
      return;
    }
  };
}

/**
 * Imperative version of {@link useTrackMention} for non-component contexts
 * (lexical plugins, plain helpers). Prefer `useTrackMention` inside components.
 */
export async function trackMention(
  sourceId: string,
  targetType: ItemType | 'user',
  targetId: string
): Promise<string | undefined> {
  if (!ENABLE_MENTION_TRACKING) return;

  const result = await storageServiceClient.createEntityMention({
    source_entity_type: 'document',
    source_entity_id: sourceId,
    entity_type: targetType,
    entity_id: targetId,
  });

  if (result.isErr()) {
    console.error('Failed to track document mention', result.error);
    return;
  }

  return result.value.id;
}

/**
 * Imperative removal of a tracked document mention, for non-component contexts
 * (lexical plugins, plain helpers).
 */
export async function untrackMention(mentionId: string): Promise<void> {
  if (!ENABLE_MENTION_TRACKING) return;

  const result = await storageServiceClient.deleteEntityMention({
    mention_id: mentionId,
  });

  if (result.isErr()) {
    console.error('Failed to untrack document mention', result.error);
  }
}
