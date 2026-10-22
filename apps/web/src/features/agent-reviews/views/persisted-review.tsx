import { fireAndForget } from '@core/util/fireAndForget';
import { createEffect, on, Show, Suspense } from 'solid-js';
import { useReview, useReviewActions } from '../queries/reviews';
import { ReviewStack } from './review-stack';

/** Every agent's ACP chain references the same authenticated, persisted review. */
export function PersistedReview(props: {
  sessionId: string;
  reviewId: string;
  canAct: boolean;
  eventId?: string;
  onDecision?: () => void;
  onDecisionFailed?: () => void;
}) {
  const query = useReview(
    () => props.sessionId,
    () => props.reviewId
  );
  const actions = useReviewActions(
    () => props.sessionId,
    () => props.reviewId
  );
  createEffect(
    on(
      () => props.eventId,
      (id) => {
        if (id) fireAndForget(query.refetch(), 'agent-reviews');
      }
    )
  );
  const decisions = {
    reload: actions.reload,
    decide: async (decision: Parameters<typeof actions.decide>[0]) => {
      if (decision.action !== 'edit') props.onDecision?.();
      try {
        return await actions.decide(decision);
      } catch (error) {
        if (decision.action !== 'edit') props.onDecisionFailed?.();
        throw error;
      }
    },
  };
  return (
    <Suspense fallback={<p class="text-xs text-ink-muted">Loading review…</p>}>
      <Show when={query.isError}>
        <p role="alert" class="text-sm text-ink-muted">
          This review could not be loaded.{' '}
          <button
            type="button"
            class="underline"
            onClick={() => fireAndForget(query.refetch(), 'agent-reviews')}
          >
            Retry
          </button>
        </p>
      </Show>
      <Show when={query.isSuccess ? query.data : undefined}>
        {(record) => (
          <ReviewStack
            review={record()}
            canAct={props.canAct}
            actions={decisions}
          />
        )}
      </Show>
    </Suspense>
  );
}
