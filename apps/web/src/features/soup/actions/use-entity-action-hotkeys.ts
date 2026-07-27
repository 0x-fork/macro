import type { ListView } from '@app/constants/list-views';
import { useAllProperties } from '@app/features/property/editor/hooks/useAllProperties';
import { openPropertyEditor } from '@app/features/property/editor/state/propertyEditor';
import { isShareableEntityType } from '@app/features/sharing/global-share-modal/GlobalShareModal';
import { openEntityInSplitFromUnifiedList } from '@app/features/soup/utils';
import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import type { SplitHandle } from '@components/app/split-layout/layoutManager';
import { useUserId } from '@core/context/user';
import { HotkeyTags } from '@core/hotkey/constants';
import { createHotkeyGroup, registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { type EntityData, isTaskEntity } from '@entity';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import type { Property, PropertyDefinitionDomain } from '@property/types';
import { macroEntityToPropertyEntityType } from '@property/utils';
import { onCleanup } from 'solid-js';
import { useSoupView } from '../view/context';
import { useIsNewInbox } from '../view/primitives/use-is-new-inbox';
import {
  makeCopyAction,
  makeCopyBranchNameAction,
  makeCopyEntityIdAction,
  makeCopyLinkAction,
  makeDeleteAction,
  makeFavoriteAction,
  makeMarkReadAction,
  makeMarkUnreadAction,
  makeMoveToProjectAction,
  makeRenameAction,
  makeSetCompanyPropertyAction,
  makeShareAction,
} from '.';
import {
  getSelectedEntities,
  type SoupActionListState,
} from './list-action-state';
import {
  canExecuteMarkDoneOnView,
  makeMarkDoneAction,
} from './make-mark-done-action';

type UseEntityActionHotkeysOptions = {
  scopeId: string;
  list: SoupActionListState;
  activeListView: () => ListView;
  activeSoupViewTab?: () => string | undefined;
  splitHandle?: SplitHandle;
  condition?: () => boolean;
  /** Fallback used when the list has no selection or focused entity. */
  getEntityFallback?: () => EntityData | undefined;
};

export const useEntityActionHotkeys = (
  options: UseEntityActionHotkeysOptions
) => {
  const { scopeId, list, splitHandle, condition, getEntityFallback } = options;

  const userId = useUserId();
  const notificationSource = useGlobalNotificationSource();
  const { collapseEntity } = useSoupView();

  const group = createHotkeyGroup();

  const markDone = makeMarkDoneAction({
    userId,
    notificationSource: () => notificationSource,
    hotkeyGroup: group,
    isNewInbox: useIsNewInbox(),
    listView: options.activeListView,
  });
  const markRead = makeMarkReadAction();
  const markUnread = makeMarkUnreadAction();

  const deleteAction = makeDeleteAction({ userId });
  const renameAction = makeRenameAction({ userId });

  const copyAction = makeCopyAction();

  const moveToProjectAction = makeMoveToProjectAction();

  const copyLinkAction = makeCopyLinkAction();

  const copyBranchNameAction = makeCopyBranchNameAction();

  const copyEntityIdAction = makeCopyEntityIdAction();

  const shareAction = makeShareAction();

  const favoriteAction = makeFavoriteAction();

  const setCompanyPropertyAction = makeSetCompanyPropertyAction();

  const getEntitiesForAction = (): EntityData[] => {
    const selected = getSelectedEntities(list);
    if (selected.length > 0) return selected;

    const focused = list.focus.item();
    if (focused?.kind === 'entity') return [focused.entity];

    // Fallback: use provided entity getter (e.g., for block views)
    if (getEntityFallback) {
      const entity = getEntityFallback();
      if (entity) return [entity];
    }

    return [];
  };

  const openNextEntity = (entity: EntityData) => {
    if (!splitHandle || splitHandle.isControllerSplit()) return;
    const handleContent = splitHandle.content().type;
    if (handleContent === 'component' || handleContent === 'project') return;
    openEntityInSplitFromUnifiedList(entity, {
      splitHandle,
      mergeHistory: true,
      referredFrom: splitHandle.referredFrom(),
    });
  };

  // Property editor setup
  const allProperties = useAllProperties();
  const propertyById = (propertyId: string) =>
    allProperties().find(({ id }) => id === propertyId);
  const status = () => propertyById(SYSTEM_PROPERTY_IDS.STATUS);
  const priority = () => propertyById(SYSTEM_PROPERTY_IDS.PRIORITY);
  const assignees = () => propertyById(SYSTEM_PROPERTY_IDS.ASSIGNEES);

  const openPropertyEditorIfSelected = (
    mode: 'selector' | 'direct' = 'selector',
    property?: Property | PropertyDefinitionDomain
  ) => {
    const entities = getEntitiesForAction();
    if (entities.length > 0) {
      openPropertyEditor(entities, mode, property);
    }
  };
  const canAssignTags = (entity: EntityData) => {
    try {
      macroEntityToPropertyEntityType(entity);
      return true;
    } catch {
      return false;
    }
  };

  // Mark Done - 'e', not included in Hotkey Group so that we can use it from inside of blocks
  registerHotkey({
    hotkey: ['e'],
    hotkeyToken: TOKENS.entity.action.markDone,
    scopeId,
    description: 'Mark done',
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      if (!entities.every(markDone.canExecute)) return false;

      markDone.executeWithList(entities, list, openNextEntity, {
        collapseEntity: collapseEntity.shouldCollapse()
          ? collapseEntity.callback()
          : undefined,
      });
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;

      const soupViewTab = options.activeSoupViewTab?.();
      if (
        soupViewTab &&
        !canExecuteMarkDoneOnView(options.activeListView(), soupViewTab)
      ) {
        return false;
      }

      const entities = getEntitiesForAction();
      return entities.length > 0 && entities.every(markDone.canExecute);
    },
    displayPriority: 10,
    tags: [HotkeyTags.SelectionModification],
  }).withGroup(group);

  // Mark unread - 'u', read email threads only; rows stay in place
  registerHotkey({
    hotkey: ['u'],
    hotkeyToken: TOKENS.entity.action.markUnread,
    scopeId,
    description: 'Mark unread',
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      if (!entities.every(markUnread.canExecute)) return false;

      markUnread.executeWithList(entities, list);
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return entities.length > 0 && entities.every(markUnread.canExecute);
    },
    displayPriority: 9,
    tags: [HotkeyTags.SelectionModification],
  }).withGroup(group);

  // Mark read - 'shift+u', email selections with at least one unread thread
  registerHotkey({
    hotkey: ['shift+u'],
    hotkeyToken: TOKENS.entity.action.markRead,
    scopeId,
    description: 'Mark read',
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      if (!entities.some(markRead.canExecute)) return false;

      markRead.executeWithList(entities, list);
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return (
        entities.length > 0 &&
        entities.every((entity) => entity.type === 'email') &&
        entities.some(markRead.canExecute)
      );
    },
    displayPriority: 9,
    tags: [HotkeyTags.SelectionModification],
  }).withGroup(group);

  // Delete - 'delete', 'backspace'
  registerHotkey({
    hotkey: ['delete', 'backspace'],
    hotkeyToken: TOKENS.entity.action.delete,
    scopeId,
    description: () => {
      const count = getEntitiesForAction().length;
      return count > 1 ? 'Delete items' : 'Delete item';
    },
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      if (!entities.every(deleteAction.canExecute)) return false;

      deleteAction.executeWithList(entities, list);
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return entities.length > 0 && entities.every(deleteAction.canExecute);
    },
    displayPriority: 10,
    tags: [HotkeyTags.SelectionModification],
  }).withGroup(group);

  // Rename - 'r'
  registerHotkey({
    hotkey: ['r'],
    hotkeyToken: TOKENS.entity.action.rename,
    scopeId,
    description: () => {
      const count = getEntitiesForAction().length;
      return count > 1 ? 'Rename items' : 'Rename item';
    },
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      if (!entities.every(renameAction.canExecute)) return false;

      renameAction.executeWithList(entities, list);
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return entities.length > 0 && entities.every(renameAction.canExecute);
    },
    displayPriority: 10,
    tags: [HotkeyTags.SelectionModification],
  }).withGroup(group);

  // Favorite - 'opt+f' (macOS emits 'ƒ'; normalizeEventKeyPress maps it back to 'f')
  registerHotkey({
    hotkey: ['opt+f'],
    hotkeyToken: TOKENS.entity.action.favorite,
    scopeId,
    description: () => {
      const entities = getEntitiesForAction();
      const allFavorited =
        entities.length > 0 &&
        entities.every((entity) => favoriteAction.isFavorited(entity));
      return allFavorited ? 'Unfavorite' : 'Favorite';
    },
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      if (!entities.every(favoriteAction.canExecute)) return false;

      favoriteAction.executeWithList(entities, list);
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return entities.length > 0 && entities.every(favoriteAction.canExecute);
    },
    displayPriority: 10,
    tags: [HotkeyTags.SelectionModification],
  }).withGroup(group);

  // Copy - 'cmd+d'
  registerHotkey({
    hotkey: ['cmd+d'],
    hotkeyToken: TOKENS.entity.action.copy,
    scopeId,
    description: () => {
      const count = getEntitiesForAction().length;
      return count > 1 ? 'Duplicate items' : 'Duplicate item';
    },
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      if (!entities.every(copyAction.canExecute)) return false;

      copyAction.executeWithList(entities, list);
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return entities.length > 0 && entities.every(copyAction.canExecute);
    },
    displayPriority: 10,
    tags: [HotkeyTags.SelectionModification],
  }).withGroup(group);

  // Move to folder - 'm'
  registerHotkey({
    hotkey: ['m'],
    hotkeyToken: TOKENS.entity.action.moveToFolder,
    scopeId,
    description: () => {
      const count = getEntitiesForAction().length;
      return count > 1 ? 'Move items to folder' : 'Move to folder';
    },
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      if (!entities.every(moveToProjectAction.canExecute)) return false;

      moveToProjectAction.executeWithList(entities, list);
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return (
        entities.length > 0 && entities.every(moveToProjectAction.canExecute)
      );
    },
    displayPriority: 10,
    tags: [HotkeyTags.SelectionModification],
  }).withGroup(group);

  // Copy link - 'shift+cmd+c'
  registerHotkey({
    hotkey: ['shift+cmd+c'],
    hotkeyToken: TOKENS.entity.action.copyLink,
    scopeId,
    description: 'Copy link',
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      if (!copyLinkAction.canExecute(entities[0])) return false;
      copyLinkAction.executeWithList(entities, list);
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return entities.length === 1 && copyLinkAction.canExecute(entities[0]);
    },
    displayPriority: 10,
    tags: [HotkeyTags.SelectionModification],
  }).withGroup(group);

  // Copy branch name - 'shift+cmd+b'
  registerHotkey({
    hotkey: ['shift+cmd+b'],
    hotkeyToken: TOKENS.entity.action.copyBranchName,
    scopeId,
    description: 'Copy branch name',
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      if (!copyBranchNameAction.canExecute(entities[0])) return false;
      copyBranchNameAction.executeWithList(entities, list);
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return (
        entities.length === 1 && copyBranchNameAction.canExecute(entities[0])
      );
    },
    displayPriority: 10,
    tags: [HotkeyTags.SelectionModification],
  }).withGroup(group);

  // Copy entity id (command menu only, no keybinding)
  registerHotkey({
    hotkeyToken: TOKENS.entity.action.copyEntityId,
    scopeId,
    description: 'Copy ID',
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      if (!copyEntityIdAction.canExecute(entities[0])) return false;
      copyEntityIdAction.executeWithList(entities, list);
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return (
        entities.length === 1 && copyEntityIdAction.canExecute(entities[0])
      );
    },
    displayPriority: 10,
    tags: [HotkeyTags.SelectionModification],
  }).withGroup(group);

  // Share
  registerHotkey({
    hotkeyToken: TOKENS.entity.action.share,
    scopeId,
    description: 'Share',
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      if (!shareAction.canExecute(entities[0])) return false;
      shareAction.executeWithList(entities, list);
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return entities.length === 1 && isShareableEntityType(entities[0].type);
    },
    displayPriority: 10,
    tags: [HotkeyTags.SelectionModification],
  }).withGroup(group);

  // Open property selector - shift+cmd+o
  registerHotkey({
    hotkey: ['shift+cmd+o'],
    hotkeyToken: TOKENS.entity.action.properties,
    tags: [HotkeyTags.SelectionModification],
    displayPriority: 10,
    description: 'Open property editor',
    keyDownHandler: () => {
      openPropertyEditorIfSelected('selector');
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return entities.length > 0 && entities.every(isTaskEntity);
    },
    scopeId,
  }).withGroup(group);

  // Assign tags - t
  registerHotkey({
    hotkey: ['t'],
    hotkeyToken: TOKENS.entity.action.tags,
    tags: [HotkeyTags.SelectionModification],
    displayPriority: 10,
    description: () => {
      const count = getEntitiesForAction().length;
      return count > 1 ? 'Tag items' : 'Tag item';
    },
    keyDownHandler: () => {
      const entities = getEntitiesForAction();
      if (entities.length === 0) return false;
      openPropertyEditor(entities, 'tag');
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return entities.length > 0 && entities.every(canAssignTags);
    },
    scopeId,
  }).withGroup(group);

  // Set priority - shift+cmd+p
  registerHotkey({
    hotkey: ['shift+cmd+p'],
    hotkeyToken: TOKENS.entity.action.priority,
    tags: [HotkeyTags.SelectionModification],
    displayPriority: 10,
    description: 'Set priority',
    keyDownHandler: () => {
      openPropertyEditorIfSelected('direct', priority());
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return (
        entities.length > 0 &&
        entities.every(isTaskEntity) &&
        Boolean(priority())
      );
    },
    scopeId,
  }).withGroup(group);

  // Set assignee - shift+cmd+a
  registerHotkey({
    hotkey: ['shift+cmd+a'],
    hotkeyToken: TOKENS.entity.action.assignee,
    tags: [HotkeyTags.SelectionModification],
    displayPriority: 10,
    description: 'Set assignee',
    keyDownHandler: () => {
      openPropertyEditorIfSelected('direct', assignees());
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return (
        entities.length > 0 &&
        entities.every(isTaskEntity) &&
        Boolean(assignees())
      );
    },
    scopeId,
  }).withGroup(group);

  // Set status - shift+cmd+s
  registerHotkey({
    hotkey: ['shift+cmd+s'],
    hotkeyToken: TOKENS.entity.action.status,
    tags: [HotkeyTags.SelectionModification],
    displayPriority: 10,
    description: 'Set status',
    keyDownHandler: () => {
      openPropertyEditorIfSelected('direct', status());
      return true;
    },
    condition: () => {
      if (condition && !condition()) return false;
      const entities = getEntitiesForAction();
      return (
        entities.length > 0 && entities.every(isTaskEntity) && Boolean(status())
      );
    },
    scopeId,
  }).withGroup(group);

  // Set stage / owner / revenue for CRM companies (command menu only, no
  // keybindings) — company counterpart of the task property commands above.
  const companyPropertyCommands = [
    { token: TOKENS.entity.action.stage, field: 'stage', label: 'Set stage' },
    { token: TOKENS.entity.action.owner, field: 'owner', label: 'Set owner' },
    {
      token: TOKENS.entity.action.revenue,
      field: 'revenue',
      label: 'Set revenue',
    },
  ] as const;
  for (const { token, field, label } of companyPropertyCommands) {
    registerHotkey({
      hotkeyToken: token,
      tags: [HotkeyTags.SelectionModification],
      displayPriority: 10,
      description: label,
      keyDownHandler: () => {
        const entities = getEntitiesForAction();
        if (entities.length === 0) return false;
        if (!entities.every(setCompanyPropertyAction.canExecute)) return false;
        setCompanyPropertyAction.execute(entities, field);
        return true;
      },
      condition: () => {
        if (condition && !condition()) return false;
        const entities = getEntitiesForAction();
        return (
          entities.length > 0 &&
          entities.every(setCompanyPropertyAction.canExecute)
        );
      },
      scopeId,
    }).withGroup(group);
  }

  onCleanup(() => group.dispose());

  return {
    openPropertyEditor: openPropertyEditorIfSelected,
  };
};
