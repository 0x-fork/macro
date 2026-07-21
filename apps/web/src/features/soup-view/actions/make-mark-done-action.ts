import type { ListView } from '@app/constants/list-views';
import {
  applyEntitiesDoneOptimistic,
  executeMarkEntitiesDone,
  executeMarkEntitiesUndone,
  type MarkEntitiesDoneContext,
  resolveMarkEntitiesDoneVariables,
  restoreSoupFocus,
} from '@app/features/next-soup/utils';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { useMaybePreviewPanel } from '@components/app/PreviewPanel';
import { useSplitPanel } from '@components/app/split-layout/layoutUtils';
import { toast } from '@core/component/Toast/Toast';
import {
  ENABLE_NEW_INBOX_FLAG,
  ENABLE_NEW_INBOX_OVERRIDE,
} from '@core/constant/featureFlags';
import type { HotkeyGroup } from '@core/hotkey/types';
import type { EntityData } from '@entity';
import type { NotificationSource } from '@notifications';
import ArrowCounterClockwise from '@phosphor-icons/core/regular/arrow-counter-clockwise.svg?component-solid';
import { type UndoHandle, useUndoableMutation } from '@queries/undo';
import type { Accessor } from 'solid-js';
import { findEntityItem, type SoupActionListState } from './list-action-state';

// Valid list views where the mark done should be allowed to run
const VALID_MARK_DONE_LIST_VIEWS: `${ListView}-${string}`[] = [
  'inbox-signal',
  'inbox-noise',
  'mail-important',
  'mail-all',
  'mail-noise',
  'mail-shared',
];

export const canExecuteMarkDoneOnView = (view: ListView, tabId: string) => {
  return VALID_MARK_DONE_LIST_VIEWS.includes(`${view}-${tabId}`);
};

type MakeMarkDoneOptions = {
  userId?: () => string | undefined;
  notificationSource: () => NotificationSource;
  /** When provided, undo entries pushed by this action are dropped from
   *  the undo stack when the group is disposed. */
  hotkeyGroup?: HotkeyGroup;
  /** Overrides route-derived New Inbox detection for isolated view hosts. */
  isNewInbox?: Accessor<boolean>;
};

type MarkDoneVariables = {
  entities: EntityData[];
  emailIds: string[];
  notificationIds: string[];
  restoreFocus?: () => void;
  /** Suppress the "Marked as done" toast, e.g. for send-triggered mark done
   *  where it would replace the "Email sent" toast. */
  silent?: boolean;
  /** Receives the undo handle once the mark-done is pushed onto the undo
   *  stack, so callers (e.g. undo-send) can reverse it programmatically. */
  onUndoHandle?: (handle: UndoHandle) => void;
};

type MarkDoneExecuteOpts = Pick<MarkDoneVariables, 'silent' | 'onUndoHandle'>;

type MarkDoneExecuteWithListOpts = MarkDoneExecuteOpts & {
  nextEntityId?: string;
  /** The list host owns collapse policy and presentation. */
  collapseEntity?: (entityId: string) => void | Promise<void>;
};

/** Must be invoked inside a component tree that provides MutationUndoProvider. */
export const makeMarkDoneAction = (options: MakeMarkDoneOptions) => {
  const splitPanel = useSplitPanel();

  const newInboxFlag = useFeatureFlag(ENABLE_NEW_INBOX_FLAG, {
    enabledOverride: ENABLE_NEW_INBOX_OVERRIDE,
  });

  // Channel and channel_thread entities share the same notification bucket.
  // The new inbox renders them as separate rows, so marking a channel as done
  // should not clear thread notifications.
  //
  // TODO: This should probably be the default case after the new inbox is released
  // or we should rework how notifications are sent to not be under just the 'channel'
  // entity
  const scopeChannelNotificationsToEntity = () =>
    options.isNewInbox?.() ??
    (newInboxFlag().enabled &&
      (splitPanel?.handle.content().id === 'inbox' ||
        splitPanel?.handle.referredFrom() === 'inbox'));

  const { notificationSource, hotkeyGroup } = options;
  const previewPanel = useMaybePreviewPanel();
  const inPreview = previewPanel !== undefined;

  const mutation = useUndoableMutation<
    void,
    Error,
    MarkDoneVariables,
    MarkEntitiesDoneContext
  >(() => ({
    hotkeyGroup,
    onMutate: (variables) =>
      applyEntitiesDoneOptimistic({
        entityIds: variables.entities.map((entity) => entity.id),
        emailIds: variables.emailIds,
        notificationIds: variables.notificationIds,
      }),
    mutationFn: (variables) =>
      executeMarkEntitiesDone({
        emailIds: variables.emailIds,
        notificationIds: variables.notificationIds,
      }),
    onError: (_err, _variables, context) => {
      context?.rollback();
      toast.failure('Failed to mark as done');
    },
    undoFn: async (variables, context) => {
      context?.applyUndone();
      try {
        await executeMarkEntitiesUndone({
          emailIds: variables.emailIds,
          notificationIds: variables.notificationIds,
        });
      } catch (err) {
        context?.reapply();
        throw err;
      }
    },
    redoFn: async (variables, context) => {
      context?.reapply();
      try {
        await executeMarkEntitiesDone({
          emailIds: variables.emailIds,
          notificationIds: variables.notificationIds,
        });
      } catch (err) {
        context?.applyUndone();
        throw err;
      }
    },
    undoLabel: 'Mark Done',
    onPushed: (handle, variables) => {
      variables.onUndoHandle?.(handle);
      const firstEntityId = variables.entities[0]?.id;
      const count = variables.entities.length;
      const message =
        count > 1 ? `Marked ${count} items as done` : 'Marked as done';
      let toastId: number | undefined;

      const showToast = () => {
        if (variables.silent) return;
        toastId = toast.success(message, {
          actions: [
            {
              label: 'Undo',
              icon: ArrowCounterClockwise,
              onClick: () => {
                handle.undo({
                  onError: () => toast.failure('Failed to undo'),
                });
              },
            },
          ],
          duration: 3_000,
          stack: true,
          hideOnMobile: true,
        });
      };

      showToast();

      return {
        onUndone: () => {
          if (toastId !== undefined) toast.dismiss(toastId);
          variables.restoreFocus?.();
          restoreSoupFocus(firstEntityId, inPreview);
        },
        onRedone: showToast,
      };
    },
  }));

  const canExecute = (entity: EntityData): boolean => {
    if (entity.type === 'channel_message') {
      return false;
    }
    if (entity.type === 'channel_thread') {
      return scopeChannelNotificationsToEntity();
    }
    if (
      entity.type === 'email' ||
      entity.type === 'channel' ||
      entity.type === 'chat' ||
      entity.type === 'document' ||
      entity.type === 'project' ||
      entity.type === 'foreign'
    ) {
      return true;
    }

    return false;
  };

  const execute = async (
    entities: EntityData[],
    restoreFocus?: () => void,
    opts?: MarkDoneExecuteOpts
  ) => {
    const { emailIds, notificationIds } = resolveMarkEntitiesDoneVariables({
      entities,
      notificationSource: notificationSource(),
      scopeChannelNotificationsToEntity: scopeChannelNotificationsToEntity(),
    });
    await mutation.mutateAsync({
      entities,
      emailIds,
      notificationIds,
      restoreFocus,
      silent: opts?.silent,
      onUndoHandle: opts?.onUndoHandle,
    });
  };

  const executeWithList = async (
    entities: EntityData[],
    list: SoupActionListState,
    onNavigate?: (entity: EntityData) => void,
    opts?: MarkDoneExecuteWithListOpts
  ) => {
    const focusedIdBeforeMarkDone = list.focus.id();
    const markedEntityIds = new Set(entities.map((entity) => entity.id));
    const adjacentItem = (direction: 1 | -1) => {
      let previousCandidateIndex: number | undefined;

      for (let distance = 1; distance <= list.items.count(); distance++) {
        const candidate = list.navigate.peekOffset(direction * distance);

        // Peeking clamps at list boundaries, so a repeated index means there
        // are no more candidates in this direction.
        if (!candidate || candidate.index === previousCandidateIndex) return;
        previousCandidateIndex = candidate.index;

        if (
          candidate.item.kind !== 'entity' ||
          candidate.item.id === focusedIdBeforeMarkDone ||
          markedEntityIds.has(candidate.item.entity.id)
        ) {
          continue;
        }

        return candidate.item;
      }
    };
    const fallbackNextItem = adjacentItem(1) ?? adjacentItem(-1);
    const requestedNextItem = opts?.nextEntityId
      ? findEntityItem(list, opts.nextEntityId)
      : undefined;
    let nextItem = fallbackNextItem;
    if (
      requestedNextItem?.kind === 'entity' &&
      list.selection.isSelectable(requestedNextItem)
    ) {
      nextItem = requestedNextItem;
    }

    if (opts?.collapseEntity) {
      await Promise.all(
        entities.map((entity) => opts.collapseEntity?.(entity.id))
      );
    }

    const restoreFocus = focusedIdBeforeMarkDone
      ? () => list.focus.set(focusedIdBeforeMarkDone)
      : undefined;

    list.selection.clear();

    if (nextItem) {
      const focused = list.focus.set(nextItem.id);
      if (focused) onNavigate?.(nextItem.entity);
    }

    await execute(entities, restoreFocus, opts);
  };

  return { canExecute, execute, executeWithList };
};
