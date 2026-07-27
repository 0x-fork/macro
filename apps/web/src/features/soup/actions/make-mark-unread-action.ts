import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import { useNonPrimaryEmailLinkIdHeader } from '@queries/email/link';
import {
  useMarkThreadAsSeenMutation,
  useMarkThreadAsUnreadMutation,
} from '@queries/email/thread';
import { refetchSoupEntity } from '@queries/soup/cache';
import type { SoupActionListState } from './list-action-state';

const withListExecution = (action: {
  canExecute: (entity: EntityData) => boolean;
  execute: (entities: EntityData[]) => Promise<void>;
}) => ({
  ...action,
  executeWithList: async (
    entities: EntityData[],
    _list: SoupActionListState
  ): Promise<void> => {
    await action.execute(entities);
  },
});

export const makeMarkUnreadAction = () => {
  const markUnreadMutation = useMarkThreadAsUnreadMutation();

  const canExecute = (entity: EntityData): boolean =>
    entity.type === 'email' && entity.isRead === true;

  const execute = async (entities: EntityData[]) => {
    const targets = entities.filter(canExecute);
    if (targets.length === 0) return;

    const results = await Promise.allSettled(
      targets.map((entity) =>
        markUnreadMutation.mutateAsync({
          threadId: entity.id,
          linkId: entity.type === 'email' ? entity.linkId : undefined,
        })
      )
    );

    const failed = targets.filter(
      (_, index) => results[index]?.status === 'rejected'
    );
    if (failed.length > 0) {
      toast.failure('Failed to mark as unread');
      failed.forEach((entity) => refetchSoupEntity(entity.id, 'emailThread'));
      return;
    }

    toast.success(
      targets.length > 1
        ? `Marked ${targets.length} items as unread`
        : 'Marked as unread',
      { duration: 3_000, stack: true, hideOnMobile: true }
    );
  };

  return withListExecution({ canExecute, execute });
};

export const makeMarkReadAction = () => {
  const markSeenMutation = useMarkThreadAsSeenMutation();
  const toHeaderLinkId = useNonPrimaryEmailLinkIdHeader();

  const canExecute = (entity: EntityData): boolean =>
    entity.type === 'email' && entity.isRead === false;

  const execute = async (entities: EntityData[]) => {
    const targets = entities.filter(canExecute);
    if (targets.length === 0) return;

    const results = await Promise.allSettled(
      targets.map((entity) =>
        markSeenMutation.mutateAsync({
          threadId: entity.id,
          linkId: toHeaderLinkId(
            entity.type === 'email' ? entity.linkId : undefined
          ),
        })
      )
    );

    const failed = targets.filter(
      (_, index) => results[index]?.status === 'rejected'
    );
    if (failed.length > 0) {
      toast.failure('Failed to mark as read');
      failed.forEach((entity) => refetchSoupEntity(entity.id, 'emailThread'));
      return;
    }

    toast.success(
      targets.length > 1
        ? `Marked ${targets.length} items as read`
        : 'Marked as read',
      { duration: 3_000, stack: true, hideOnMobile: true }
    );
  };

  return withListExecution({ canExecute, execute });
};
