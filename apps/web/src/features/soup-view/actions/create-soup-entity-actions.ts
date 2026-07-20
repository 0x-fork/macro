import { useList } from '@app/components/list';
import { isListViewID } from '@app/constants/list-views';
import { getChannelEntityTarget } from '@app/features/next-soup/utils';
import { type SoupItem, useSoupCollection } from '@app/features/soup-list';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { globalSplitManager } from '@app/signal/splitLayout';
import {
  getChannelParams,
  goToChannelMessage,
} from '@block-channel/utils/link';
import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { fileTypeToBlockName, itemToBlockName } from '@core/constant/allBlocks';
import { useUserId } from '@core/context/user';
import { type HotkeyToken, TOKENS } from '@core/hotkey/tokens';
import { isMobile } from '@core/mobile/isMobile';
import type { EntityData } from '@entity';
import { useSetCompanyHiddenMutation } from '@queries/crm/companies';
import type { Component, JSX } from 'solid-js';
import { useSoupView } from '../context';
import { useIsNewInbox } from '../utils';
import {
  makeBlockSenderAction,
  makeCopyAction,
  makeCopyBranchNameAction,
  makeCopyEntityIdAction,
  makeCopyLinkAction,
  makeDeleteAction,
  makeFavoriteAction,
  makeHideCompanyAction,
  makeMarkSenderNoiseAction,
  makeMarkSenderSignalAction,
  makeMoveToProjectAction,
  makeRemoveFromProjectAction,
  makeRenameAction,
  makeSetCompanyPropertyAction,
  makeShareAction,
} from '.';
import type { SoupActionListState } from './list-action-state';
import {
  canExecuteMarkDoneOnView,
  makeMarkDoneAction,
} from './make-mark-done-action';

const SIGNAL_TABS = new Set<string | undefined>([
  undefined,
  'signal',
  'important',
]);
const NOISE_TABS = new Set(['noise']);

type SoupEntityActionItem = {
  id: string;
  label: string;
  icon?: Component<JSX.SvgSVGAttributes<SVGSVGElement>>;
  hotkeyToken?: HotkeyToken;
  shortcut?: string;
  onClick: () => void | Promise<void>;
  destructive?: boolean;
};

type SoupEntityActionGroup = {
  items: SoupEntityActionItem[];
};

type BuildActionContext = {
  /** Set when the menu host can anchor a tag picker for the clicked row. */
  editTags?: () => void;
};

type BuildActionGroups = (
  entities: readonly EntityData[],
  context?: BuildActionContext
) => SoupEntityActionGroup[];

/** The folder whose contents the split is showing, if any. */
export const viewedProjectIdFromContent = (content: {
  type: string;
  id: string;
}): string | undefined =>
  content.type === 'project' && content.id !== 'root' && content.id !== 'trash'
    ? content.id
    : undefined;

export function createSoupEntityActions() {
  const analytics = useAnalytics();
  const userId = useUserId();
  const notificationSource = useGlobalNotificationSource();
  const hiddenMutation = useSetCompanyHiddenMutation();
  const collection = useSoupCollection();
  const view = useSoupView();
  const panel = useSplitPanelOrThrow();
  const isNewInbox = useIsNewInbox();
  const { state: list } = useList<SoupItem>();

  const markDone = makeMarkDoneAction({
    userId,
    notificationSource: () => notificationSource,
    isNewInbox,
  });

  const deleteAction = makeDeleteAction({ userId });
  const renameAction = makeRenameAction({ userId });

  const copyAction = makeCopyAction();
  const favoriteAction = makeFavoriteAction();
  const moveToProjectAction = makeMoveToProjectAction();
  const removeFromProjectAction = makeRemoveFromProjectAction();
  const copyLinkAction = makeCopyLinkAction();
  const copyBranchNameAction = makeCopyBranchNameAction();
  const copyEntityIdAction = makeCopyEntityIdAction();
  const shareAction = makeShareAction();
  const blockSenderAction = makeBlockSenderAction();
  const markSenderSignalAction = makeMarkSenderSignalAction();
  const markSenderNoiseAction = makeMarkSenderNoiseAction();
  const hideCompanyAction = makeHideCompanyAction({
    setHidden: (companyId, hidden) =>
      hiddenMutation.mutateAsync({ companyId, hidden }),
  });
  const setCompanyPropertyAction = makeSetCompanyPropertyAction();

  const buildActionGroups: BuildActionGroups = (
    sourceEntities,
    context = {}
  ) => {
    const entities = [...sourceEntities];
    const activeTab = collection.state.activeTab;
    const activeListView = view.view();
    const viewedProjectId = viewedProjectIdFromContent(panel.handle.content());
    const openTagPicker = context.editTags;
    const canExecuteAll = (canExecute: (entity: EntityData) => boolean) =>
      entities.length > 0 && entities.every(canExecute);

    const handle =
      (
        execute: (
          entities: EntityData[],
          list: SoupActionListState
        ) => Promise<void>
      ) =>
      () =>
        execute(entities, list);

    // Top group: Mark Done, Open in new split
    const topItems: SoupEntityActionItem[] = [];

    if (
      activeTab &&
      isListViewID(activeListView) &&
      canExecuteMarkDoneOnView(activeListView, activeTab) &&
      canExecuteAll(markDone.canExecute)
    ) {
      topItems.push({
        id: 'mark-done',
        label: 'Mark Done',
        hotkeyToken: TOKENS.entity.action.markDone,
        onClick: () =>
          markDone.executeWithList(entities, list, undefined, {
            collapseEntity: view.collapseEntity.shouldCollapse()
              ? view.collapseEntity.callback()
              : undefined,
          }),
      });
    }

    const canOpenInSplit = () => {
      if (isMobile()) return false;
      if (entities.length !== 1) return false;
      const entity = entities[0];
      const splitManager = globalSplitManager();
      if (!splitManager) return false;
      // TODO(dev-rb/github): Allow GitHub PRs once they map to /pr.
      if (entity.type === 'foreign') return false;
      const contentId =
        entity.type === 'channel_message' || entity.type === 'channel_thread'
          ? entity.channelId
          : entity.id;
      const contentType = itemToBlockName(entity);
      return !splitManager.getSplitByContent(contentType, contentId);
    };

    if (canOpenInSplit()) {
      const openInNewSplit = async () => {
        const entity = entities[0];
        if (!entity) return;

        const splitManager = globalSplitManager();
        if (!splitManager) return;

        analytics.track('split_created', {
          from: 'soup_view_entity_actions_menu',
        });

        if (entity.type === 'document') {
          const { fileType, id, subType } = entity;
          splitManager.createNewSplit({
            content: {
              type: fileTypeToBlockName(subType?.type ?? fileType),
              id,
            },
            referredFrom: 'entity-actions-menu',
          });
        } else if (
          entity.type === 'channel_message' ||
          entity.type === 'channel_thread'
        ) {
          // Thread rows are keyed by their root; getChannelEntityTarget
          // recovers the clicked reply from the driving notification so the
          // new split lands on it rather than the root message. These rows
          // always resolve to a message target (their own ids at worst), never
          // `latest`, which only a whole-channel row produces.
          const resolved = getChannelEntityTarget(entity);
          const target =
            resolved?.kind === 'message'
              ? resolved
              : { messageId: entity.messageId, threadId: entity.threadId };
          splitManager.createNewSplit({
            content: {
              type: 'channel',
              id: entity.channelId,
              params: getChannelParams(target.messageId, target.threadId),
            },
            referredFrom: 'entity-actions-menu',
          });

          await goToChannelMessage(
            splitManager.getOrchestrator(),
            entity.channelId,
            target.messageId,
            target.threadId
          );
        } else if (entity.type === 'crm_company') {
          splitManager.createNewSplit({
            content: {
              type: 'company',
              id: entity.id,
            },
            referredFrom: 'entity-actions-menu',
          });
        } else if (entity.type === 'crm_contact') {
          splitManager.createNewSplit({
            content: {
              type: 'contact',
              id: entity.id,
            },
            referredFrom: 'entity-actions-menu',
          });
        } else if (entity.type !== 'foreign') {
          splitManager.createNewSplit({
            content: {
              type: itemToBlockName(entity),
              id: entity.id,
            },
            referredFrom: 'entity-actions-menu',
          });
        }
      };

      topItems.push({
        id: 'open-in-split',
        label: 'Open in new split',
        shortcut: 'shift+enter',
        onClick: openInNewSplit,
      });
    }

    // Middle group: Rename, Move to folder, Duplicate, Copy Link, Copy Branch Name, Share
    const middleItems: SoupEntityActionItem[] = [];

    if (canExecuteAll(renameAction.canExecute)) {
      middleItems.push({
        id: 'rename',
        label: 'Rename',
        hotkeyToken: TOKENS.entity.action.rename,
        onClick: handle(renameAction.executeWithList),
      });
    }

    if (canExecuteAll(favoriteAction.canExecute)) {
      const allFavorited = entities.every((entity) =>
        favoriteAction.isFavorited(entity)
      );
      // No icon: the other items in this menu don't have one.
      middleItems.push({
        id: 'favorite',
        label: allFavorited ? 'Unfavorite' : 'Favorite',
        hotkeyToken: TOKENS.entity.action.favorite,
        onClick: handle(favoriteAction.executeWithList),
      });
    }

    if (entities.length === 1 && openTagPicker) {
      middleItems.push({
        id: 'add-label',
        label: 'Add label',
        onClick: openTagPicker,
      });
    }

    if (canExecuteAll(moveToProjectAction.canExecute)) {
      middleItems.push({
        id: 'move-to-folder',
        label: 'Move to folder',
        hotkeyToken: TOKENS.entity.action.moveToFolder,
        onClick: handle(moveToProjectAction.executeWithList),
      });
    }

    if (viewedProjectId && canExecuteAll(removeFromProjectAction.canExecute)) {
      middleItems.push({
        id: 'remove-from-folder',
        label: 'Remove from folder',
        onClick: handle(removeFromProjectAction.executeWithList),
      });
    }

    if (canExecuteAll(copyAction.canExecute)) {
      middleItems.push({
        id: 'duplicate',
        label: 'Duplicate',
        hotkeyToken: TOKENS.entity.action.copy,
        onClick: handle(copyAction.executeWithList),
      });
    }

    if (entities.length === 1) {
      middleItems.push({
        id: 'copy-link',
        label: 'Copy Link',
        hotkeyToken: TOKENS.entity.action.copyLink,
        onClick: handle(copyLinkAction.executeWithList),
      });

      if (copyBranchNameAction.canExecute(entities[0])) {
        middleItems.push({
          id: 'copy-branch-name',
          label: 'Copy Branch Name',
          hotkeyToken: TOKENS.entity.action.copyBranchName,
          onClick: handle(copyBranchNameAction.executeWithList),
        });
      }

      middleItems.push({
        id: 'copy-entity-id',
        label: 'Copy ID',
        onClick: handle(copyEntityIdAction.executeWithList),
      });

      if (shareAction.canExecute(entities[0])) {
        middleItems.push({
          id: 'share',
          label: 'Share',
          onClick: handle(shareAction.executeWithList),
        });
      }
    }

    // Sender group: Sender → Signal, Sender → Noise, Block Sender
    const senderItems: SoupEntityActionItem[] = [];

    if (
      NOISE_TABS.has(activeTab ?? '') &&
      canExecuteAll(markSenderSignalAction.canExecute)
    ) {
      senderItems.push({
        id: 'sender-signal',
        label: 'Sender → Signal',
        onClick: handle(markSenderSignalAction.executeWithList),
      });
    }

    if (
      SIGNAL_TABS.has(activeTab) &&
      canExecuteAll(markSenderNoiseAction.canExecute)
    ) {
      senderItems.push({
        id: 'sender-noise',
        label: 'Sender → Noise',
        onClick: handle(markSenderNoiseAction.executeWithList),
      });
    }

    if (canExecuteAll(blockSenderAction.canExecute)) {
      senderItems.push({
        id: 'block-sender',
        label: 'Block Sender',
        onClick: handle(blockSenderAction.executeWithList),
      });
    }

    // CRM group: Set stage/owner/revenue on the whole company
    // selection, Hide / Unhide for a single company.
    const crmItems: SoupEntityActionItem[] = [];

    if (canExecuteAll(setCompanyPropertyAction.canExecute)) {
      crmItems.push(
        {
          id: 'set-stage',
          label: 'Set stage',
          onClick: () => setCompanyPropertyAction.execute(entities, 'stage'),
        },
        {
          id: 'set-owner',
          label: 'Set owner',
          onClick: () => setCompanyPropertyAction.execute(entities, 'owner'),
        },
        {
          id: 'set-revenue',
          label: 'Set revenue',
          onClick: () => setCompanyPropertyAction.execute(entities, 'revenue'),
        }
      );
    }

    const singleEntity = entities.length === 1 ? entities[0] : undefined;
    if (
      singleEntity?.type === 'crm_company' &&
      hideCompanyAction.canExecute(singleEntity)
    ) {
      crmItems.push({
        id: 'hide-company',
        label: singleEntity.hidden ? 'Unhide' : 'Hide',
        onClick: handle(hideCompanyAction.executeWithList),
      });
    }

    // Delete group
    const deleteItems: SoupEntityActionItem[] = [];

    if (canExecuteAll(deleteAction.canExecute)) {
      deleteItems.push({
        id: 'delete',
        label: 'Delete',
        hotkeyToken: TOKENS.entity.action.delete,
        onClick: handle(deleteAction.executeWithList),
        destructive: true,
      });
    }

    return [topItems, middleItems, senderItems, crmItems, deleteItems]
      .filter((items) => items.length > 0)
      .map((items) => ({ items }));
  };

  return { buildActionGroups };
}
