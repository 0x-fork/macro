import type {
  DiscussionComment,
  DiscussionSource,
  DiscussionThread,
} from '@core/comments/discussion';
import { useUserId } from '@core/context/user';
import { compareDateAsc } from '@core/util/date';
import { throwOnErr } from '@core/util/result';
import { buildSimpleEntityUrl } from '@core/util/url';
import { storageServiceClient } from '@service-storage/client';
import type { CrmComment } from '@service-storage/generated/schemas/crmComment';
import type { CrmCommentEntityType } from '@service-storage/generated/schemas/crmCommentEntityType';
import type { CrmCommentThread } from '@service-storage/generated/schemas/crmCommentThread';
import { useQuery, useQueryClient } from '@tanstack/solid-query';
import { type Accessor, createMemo } from 'solid-js';

const CRM_COMMENTS_STALE_TIME = 60 * 1000;

/** Maps a server `CrmCommentThread` (uuid ids) to the normalized view model. */
function toViewThread(ct: CrmCommentThread): DiscussionThread {
  const comments: DiscussionComment[] = [...ct.comments]
    .sort((a, b) => compareDateAsc(a.createdAt, b.createdAt))
    .map((c) => ({
      id: c.commentId,
      threadId: c.threadId,
      authorId: c.sender ?? c.owner,
      text: c.text,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      deletedAt: c.deletedAt ?? null,
    }));
  return {
    id: ct.thread.threadId,
    resolved: ct.thread.resolved,
    comments,
  };
}

/** Replaces the matching thread or appends it when new. */
function upsertThread(
  prev: CrmCommentThread[],
  next: CrmCommentThread
): CrmCommentThread[] {
  let replaced = false;
  const out = prev.map((t) => {
    if (t.thread.threadId === next.thread.threadId) {
      replaced = true;
      return next;
    }
    return t;
  });
  if (!replaced) out.push(next);
  return out;
}

/**
 * [`DiscussionSource`] backed by the CRM comments API for a company or
 * contact. Ids are already uuid strings, so no id adaptation is needed; the
 * `DISCUSSION:` mark filter doesn't apply either (every CRM thread is a
 * discussion). Backed by a TanStack query with point cache updates after
 * each mutation. Must be called within a component owner.
 */
export function useCrmDiscussionSource(
  entityType: CrmCommentEntityType,
  entityId: Accessor<string | undefined>
): DiscussionSource {
  const userId = useUserId();
  const queryClient = useQueryClient();

  const commentsQuery = useQuery(() => {
    const id = entityId();
    return {
      queryKey: ['crm', entityType, id, 'comments'],
      queryFn: () => {
        if (!id) {
          throw new Error('entity id is required to fetch comments');
        }
        return throwOnErr(() =>
          storageServiceClient.crmComments.list({ entityType, entityId: id })
        );
      },
      enabled: !!id,
      staleTime: CRM_COMMENTS_STALE_TIME,
    };
  });

  const threads = createMemo<DiscussionThread[]>(() =>
    (commentsQuery.data ?? []).map(toViewThread)
  );

  const setThreads = (
    updater: (prev: CrmCommentThread[]) => CrmCommentThread[]
  ) => {
    const id = entityId();
    if (!id) return;
    queryClient.setQueryData<CrmCommentThread[]>(
      ['crm', entityType, id, 'comments'],
      (prev) => updater(prev ?? [])
    );
  };

  const replaceComment = (updated: CrmComment) =>
    setThreads((prev) =>
      prev.map((ct) =>
        ct.thread.threadId === updated.threadId
          ? {
              ...ct,
              comments: ct.comments.map((c) =>
                c.commentId === updated.commentId ? updated : c
              ),
            }
          : ct
      )
    );

  return {
    threads,
    canEdit: () => !!userId(),
    currentUserId: userId,
    // CRM comments aren't deep-linked yet.
    targetCommentId: () => null,
    async createThread(text) {
      const id = entityId();
      if (!id) return;
      const res = await storageServiceClient.crmComments.create({
        entityType,
        entityId: id,
        body: { text },
      });
      if (res.isErr()) {
        console.error('Unable to create CRM comment');
        return;
      }
      setThreads((prev) => upsertThread(prev, res.value));
    },
    async createReply(threadId, text) {
      const id = entityId();
      if (!id) return;
      const res = await storageServiceClient.crmComments.create({
        entityType,
        entityId: id,
        body: { text, threadId },
      });
      if (res.isErr()) {
        console.error('Unable to reply to CRM comment');
        return;
      }
      setThreads((prev) => upsertThread(prev, res.value));
    },
    async editComment(comment, text) {
      const res = await storageServiceClient.crmComments.edit({
        commentId: comment.id,
        body: { text },
      });
      if (res.isErr()) {
        console.error('Unable to edit CRM comment');
        return;
      }
      replaceComment(res.value);
    },
    async deleteComment(comment) {
      const res = await storageServiceClient.crmComments.delete({
        commentId: comment.id,
      });
      if (res.isErr()) {
        console.error('Unable to delete CRM comment');
        return;
      }
      const { threadId, threadDeleted } = res.value;
      setThreads((prev) =>
        threadDeleted
          ? prev.filter((ct) => ct.thread.threadId !== threadId)
          : prev.map((ct) =>
              ct.thread.threadId === threadId
                ? {
                    ...ct,
                    comments: ct.comments.filter(
                      (c) => c.commentId !== comment.id
                    ),
                  }
                : ct
            )
      );
    },
    buildCommentLink(comment) {
      return buildSimpleEntityUrl(
        { type: entityType, id: entityId() ?? '' },
        { commentId: comment.id }
      );
    },
  };
}
