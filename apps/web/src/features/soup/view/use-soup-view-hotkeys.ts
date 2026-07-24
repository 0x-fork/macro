import type {
  ListActivateOptions,
  ListActivation,
  ListNavigationResult,
} from '@app/components/list';
import { GO_TO_COMMAND_SCOPE, GO_TO_LEADER_KEY } from '@app/constants/hotkeys';
import { CommandState } from '@app/features/command/state';
import { useSoup } from '@app/features/next-soup/soup-context';
import { previewContentMatchesEntity } from '@app/features/next-soup/soup-view/preview-content-row';
import {
  isDuplicatePreviewEntityOpen,
  notifyDuplicateContentOpen,
  openEntityInSplitFromUnifiedList,
} from '@app/features/next-soup/utils';
import type { SoupEntityRow, SoupRow } from '@app/features/soup/collection';
import { useSoupView } from '@app/features/soup/view/context';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { globalSplitManager } from '@app/signal/splitLayout';
import type {
  SplitContent,
  SplitEvent,
  SplitEventPayload,
} from '@components/app/split-layout/layoutManager';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { entityIdSelector } from '@core/dom-selectors';
import {
  createHotkeyGroup,
  registerHotkey as registerBaseHotkey,
} from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { isScopeInActiveBranch } from '@core/hotkey/utils';
import {
  type EntityData,
  filterNotDoneNotifications,
  filterValidNotifications,
  isWithNotification,
} from '@entity';
import { openSingleStackNotification } from '@notifications';
import { debounce } from '@solid-primitives/scheduled';
import { type Accessor, createEffect, createMemo, onCleanup } from 'solid-js';
import type { VirtualizerHandle } from 'virtua/solid';
import { useEntityActionHotkeys } from './actions/use-entity-action-hotkeys';

const LOAD_MORE_DISTANCE_FROM_END = 3;
const NUMBER_TAB_HOTKEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
] as const;

type UseSoupViewHotkeysOptions = {
  listScopeId: string;
  scopeId?: string;
  root: Accessor<HTMLElement | undefined>;
  virtualizer: Accessor<VirtualizerHandle | undefined>;
  activate: (activation: ListActivation<SoupRow>) => void;
  enabled?: Accessor<boolean>;
  canNavigate?: Accessor<boolean>;
  onNavigate?: (row: SoupRow, index: number) => void;
};

const entityFromRow = (row: SoupRow | undefined): EntityData | undefined => {
  if (row?.kind !== 'entity') return;
  return row.entity;
};

/** Owns Soup keyboard commands and their mounted/persistent lifetimes. */
export function useSoupViewHotkeys(options: UseSoupViewHotkeysOptions) {
  const panel = useSplitPanelOrThrow();
  const { applyTabPreset, collection, setSortOpen, sortVisible, tabs, view } =
    useSoupView();
  const analytics = useAnalytics();
  const listState = useSoup().list;
  const enabled = () => options.enabled?.() ?? true;

  useEntityActionHotkeys({
    scopeId: options.listScopeId,
    list: listState,
    activeListView: view,
    activeSoupViewTab: () => collection.state.activeTab,
    splitHandle: panel.handle,
    condition: enabled,
  });
  const registerHotkey = (hotkey: Parameters<typeof registerBaseHotkey>[0]) =>
    registerBaseHotkey({
      ...hotkey,
      condition: () => enabled() && (hotkey.condition?.() ?? true),
    });
  const scrollTo = (index: number) =>
    options.virtualizer()?.scrollToIndex(index, { align: 'nearest' });

  const openInViewerDebounced = debounce((entity: EntityData) => {
    void openEntityInSplitFromUnifiedList(entity, {
      splitHandle: panel.handle,
      referredFrom: view(),
      mergeHistory: true,
    });
  }, 150);
  onCleanup(() => openInViewerDebounced.clear());

  const rowForPreviewContent = (content: SplitContent) => {
    const focused = listState.focus.item();
    if (
      focused?.kind === 'entity' &&
      previewContentMatchesEntity(content, focused.entity)
    ) {
      return focused;
    }

    return listState.items
      .all()
      .find(
        (row) =>
          row.kind === 'entity' &&
          previewContentMatchesEntity(content, row.entity)
      );
  };

  createEffect(() => {
    const viewerId = panel.handle.viewerId();
    if (!viewerId) return;
    const viewer = globalSplitManager()?.getSplit(viewerId);
    if (!viewer) return;

    const syncFocus = (
      payload: SplitEventPayload[SplitEvent.ContentChange]
    ) => {
      if (
        payload.cause !== 'history-back' &&
        payload.cause !== 'history-forward'
      ) {
        return;
      }
      const row = rowForPreviewContent(payload.newContent);
      if (!row) return;
      const result = listState.navigate.toId(row.id, {
        reason: 'restore',
        force: true,
      });
      if (result) scrollTo(result.index);
    };

    viewer.registerContentChangeListener(syncFocus);
    onCleanup(() => viewer.unregisterContentChangeListener(syncFocus));
  });

  const fetchMore = async () => {
    const dataSource = listState.dataSource();
    if (!dataSource || !dataSource.hasMore() || dataSource.isLoadingMore()) {
      return;
    }
    await dataSource.loadMore();
  };

  const canNavigate = () => {
    if (!enabled()) return false;
    if (options.canNavigate && !options.canNavigate()) return false;

    const contentType = panel.handle.content().type;
    const referredFrom = panel.handle.referredFrom();
    return (
      contentType === 'component' ||
      contentType === 'project' ||
      referredFrom === 'inbox' ||
      referredFrom === 'mail'
    );
  };

  const navigateToAdjacentEntity = (offset: number) => {
    const rows = listState.items.all();
    const direction = offset < 0 ? -1 : 1;
    let index = listState.focus.index();
    if (index < 0) index = direction > 0 ? -1 : rows.length;
    let skippedDuplicate = false;

    for (
      index += direction;
      index >= 0 && index < rows.length;
      index += direction
    ) {
      const row = rows[index];
      if (row?.kind !== 'entity') continue;
      if (!listState.selection.isSelectable(row)) continue;
      if (
        panel.handle.isControllerSplit() &&
        isDuplicatePreviewEntityOpen(row.entity, panel.handle)
      ) {
        skippedDuplicate = true;
        continue;
      }
      if (skippedDuplicate) notifyDuplicateContentOpen();
      return listState.navigate.toIndex(index, { reason: 'keyboard' });
    }

    if (skippedDuplicate) notifyDuplicateContentOpen();
  };

  const navigateVisibleList = (offset: number) => {
    const initialIndex = listState.focus.index();
    let skippedDuplicate = false;

    for (let attempts = 1; attempts <= listState.items.count(); attempts++) {
      const next = listState.navigate.peekOffset(offset * attempts);
      if (!next || next.index === initialIndex) break;
      if (
        panel.handle.isControllerSplit() &&
        next.item.kind === 'entity' &&
        isDuplicatePreviewEntityOpen(next.item.entity, panel.handle)
      ) {
        skippedDuplicate = true;
        continue;
      }
      if (skippedDuplicate) notifyDuplicateContentOpen();
      return listState.navigate.toIndex(next.index, { reason: 'keyboard' });
    }

    if (skippedDuplicate) notifyDuplicateContentOpen();
  };

  const navigate = (offset: number) => {
    if (!canNavigate()) return false;
    const count = listState.items.count();
    const listVisible = options.root()?.isConnected === true;
    let next: ListNavigationResult<SoupRow>;
    if (listVisible) {
      next = navigateVisibleList(offset);
    } else {
      next = navigateToAdjacentEntity(offset);
    }
    if (!next) {
      if (offset > 0) void fetchMore();
      return true;
    }

    scrollTo(next.index);
    options.onNavigate?.(next.item, next.index);

    if (next.item.kind === 'entity') {
      if (panel.handle.isControllerSplit()) {
        openInViewerDebounced(next.item.entity);
      } else if (!listVisible) {
        void openEntityInSplitFromUnifiedList(next.item.entity, {
          splitHandle: panel.handle,
          referredFrom: view(),
          mergeHistory: true,
        });
      }
    }

    if (offset > 0 && next.index >= count - 1 - LOAD_MORE_DISTANCE_FROM_END) {
      void fetchMore();
    }
    return true;
  };

  const navigateAndSelect = (offset: number) => {
    const focused = listState.focus.item();
    const focusedIndex = listState.focus.index();
    const selection = listState.selection;
    const items = listState.items.all();
    const direction = offset < 0 ? -1 : 1;
    let nextIndex =
      focusedIndex >= 0 ? focusedIndex : direction > 0 ? -1 : items.length;
    let next: SoupRow | undefined;

    while (!next && nextIndex >= -1 && nextIndex <= items.length) {
      nextIndex += direction;
      const candidate = items[nextIndex];
      if (!candidate) break;
      if (selection.isSelectable(candidate)) next = candidate;
    }
    if (!next || next.id === focused?.id) return true;

    const moveAndSelect = () => {
      const result = listState.navigate.toIndex(nextIndex, {
        reason: 'keyboard',
      });
      if (result) {
        selection.select(next);
        scrollTo(result.index);
      }
    };

    if (!focused || !selection.isSelectable(focused)) {
      moveAndSelect();
      return true;
    }
    if (selection.count() === 0) {
      selection.select(focused);
      return true;
    }
    if (!selection.isSelected(focused.id) && !selection.isSelected(next.id)) {
      selection.select(focused);
      moveAndSelect();
      return true;
    }
    if (selection.isSelected(next.id)) {
      selection.deselect(focused.id);
      const result = listState.navigate.toIndex(nextIndex, {
        reason: 'keyboard',
      });
      if (result) scrollTo(result.index);
      return true;
    }

    moveAndSelect();
    return true;
  };

  const setFocusedGroupExpanded = (expanded: boolean): boolean | undefined => {
    const item = listState.focus.item();
    if (!item || item.kind !== 'group-header') return undefined;
    const currentlyExpanded = collection.collapsedGroups.isExpanded(
      item.groupId
    );
    if (currentlyExpanded === expanded) return false;
    collection.collapsedGroups.toggle(item.groupId);
    return true;
  };

  const getCollapsibleToggle = () => {
    const entity = entityFromRow(listState.focus.item());
    if (!entity) return;
    const element = options.root()?.querySelector(entityIdSelector(entity.id));
    return element?.querySelector(
      'button[data-collapsible-toggle]'
    ) as HTMLButtonElement | null;
  };

  const tryOpenChannelNotification = (newSplit: boolean) => {
    const entity = entityFromRow(listState.focus.item());
    if (entity?.type !== 'channel' || !isWithNotification(entity)) return false;

    const notifications = filterNotDoneNotifications(
      filterValidNotifications(entity.notifications?.() ?? [])
    );
    const splitManager = globalSplitManager();
    if (!splitManager) return false;
    return openSingleStackNotification(notifications, splitManager, newSplit);
  };

  const activateCurrent = (activateOptions: ListActivateOptions) => {
    const item = listState.focus.item();
    const index = listState.focus.index();
    if (!item || index < 0) return;
    const activation: ListActivation<SoupRow> = {
      item,
      index,
      reason: activateOptions.reason ?? 'programmatic',
      metadata: activateOptions.metadata,
    };
    options.activate(activation);
    return activation;
  };

  const currentTabIndex = createMemo(() => {
    const availableTabs = tabs();
    const current = availableTabs.findIndex(
      (tab) => tab.value === collection.state.activeTab
    );
    if (current >= 0) return current;
    return 0;
  });

  const cycleTab = (offset: number) => {
    const availableTabs = tabs();
    if (availableTabs.length <= 1) return false;
    const next =
      (currentTabIndex() + offset + availableTabs.length) %
      availableTabs.length;
    const tab = availableTabs[next];
    if (!tab) return false;
    return applyTabPreset(tab.value);
  };

  const hotkeys = createHotkeyGroup();

  // Keep J/K scoped to the mounted Soup view until navigation ownership has
  // a dedicated solution outside the split-panel context.
  const navigationScope = panel.splitHotkeyScope;
  registerHotkey({
    hotkey: 'j',
    hotkeyToken: TOKENS.entity.step.end,
    scopeId: navigationScope,
    description: 'Down',
    condition: canNavigate,
    keyDownHandler: () => navigate(1),
    hide: true,
  });
  registerHotkey({
    hotkey: 'k',
    hotkeyToken: TOKENS.entity.step.start,
    scopeId: navigationScope,
    description: 'Up',
    condition: canNavigate,
    keyDownHandler: () => navigate(-1),
    hide: true,
  });

  for (let index = 0; index < NUMBER_TAB_HOTKEYS.length; index++) {
    const hotkey = NUMBER_TAB_HOTKEYS[index];
    if (!hotkey) continue;
    registerHotkey({
      hotkey,
      hotkeyToken: TOKENS.soup.tabs[hotkey],
      scopeId: options.listScopeId,
      description: `Switch to tab ${hotkey}`,
      condition: () => tabs().length > index,
      keyDownHandler: () => {
        const tab = tabs()[index];
        if (!tab) return false;
        return applyTabPreset(tab.value);
      },
      hide: true,
    }).withGroup(hotkeys);
  }

  registerHotkey({
    hotkey: 'tab',
    hotkeyToken: TOKENS.soup.tabs.next,
    scopeId: options.listScopeId,
    description: 'Next tab',
    condition: () => tabs().length > 1,
    keyDownHandler: (event) => {
      event?.preventDefault();
      return cycleTab(1);
    },
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: 'shift+tab',
    hotkeyToken: TOKENS.soup.tabs.prev,
    scopeId: options.listScopeId,
    description: 'Previous tab',
    condition: () => tabs().length > 1,
    keyDownHandler: (event) => {
      event?.preventDefault();
      return cycleTab(-1);
    },
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: 's',
    hotkeyToken: TOKENS.soup.sort,
    scopeId: options.listScopeId,
    description: 'Open sort menu',
    condition: sortVisible,
    keyDownHandler: () => {
      setSortOpen(true);
      return true;
    },
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: 'arrowdown',
    scopeId: options.listScopeId,
    description: 'Down',
    keyDownHandler: () => navigate(1),
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: 'arrowup',
    scopeId: options.listScopeId,
    description: 'Up',
    keyDownHandler: () => navigate(-1),
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: ['shift+arrowup', 'shift+k'],
    hotkeyToken: TOKENS.entity.select.start,
    scopeId: options.listScopeId,
    description: 'Select up',
    keyDownHandler: () => navigateAndSelect(-1),
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: ['shift+arrowdown', 'shift+j'],
    hotkeyToken: TOKENS.entity.select.end,
    scopeId: options.listScopeId,
    description: 'Select down',
    keyDownHandler: () => navigateAndSelect(1),
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: ['h', 'arrowleft'],
    hotkeyToken: TOKENS.unifiedList.navigation.parent,
    scopeId: options.listScopeId,
    description: 'Collapse item',
    keyDownHandler: () => {
      const groupHandled = setFocusedGroupExpanded(false);
      if (groupHandled !== undefined) return groupHandled;

      const toggle = getCollapsibleToggle();
      if (toggle?.dataset.collapsibleState === 'expanded') {
        toggle.click();
        return true;
      }

      const item = listState.focus.item();
      if (!item || item.kind !== 'entity' || !item.groupId) return false;
      if (!collection.collapsedGroups.isExpanded(item.groupId)) return false;
      collection.collapsedGroups.toggle(item.groupId);
      const header = listState.items
        .all()
        .find(
          (candidate) =>
            candidate.kind === 'group-header' &&
            candidate.groupId === item.groupId
        );
      if (header) {
        const result = listState.navigate.toId(header.id);
        if (result) scrollTo(result.index);
      }
      return true;
    },
    registrationType: 'add',
    handlerPriority: 4,
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: ['l', 'arrowright'],
    hotkeyToken: TOKENS.unifiedList.navigation.child,
    scopeId: options.listScopeId,
    description: 'Expand item',
    keyDownHandler: () => {
      const groupHandled = setFocusedGroupExpanded(true);
      if (groupHandled !== undefined) return groupHandled;

      const toggle = getCollapsibleToggle();
      if (toggle?.dataset.collapsibleState === 'collapsed') {
        toggle.click();
        return true;
      }
      return false;
    },
    registrationType: 'add',
    handlerPriority: 4,
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: 'home',
    hotkeyToken: TOKENS.entity.jump.home,
    scopeId: options.listScopeId,
    description: 'First item',
    keyDownHandler: () => {
      const next = listState.navigate.toFirst();
      if (next) scrollTo(next.index);
      return true;
    },
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: GO_TO_LEADER_KEY,
    scopeId: GO_TO_COMMAND_SCOPE,
    description: 'First item',
    condition: () => isScopeInActiveBranch(options.listScopeId),
    keyDownHandler: () => {
      const next = listState.navigate.toFirst();
      if (next) scrollTo(next.index);
      return true;
    },
    registrationType: 'add',
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: ['shift+g', 'end'],
    hotkeyToken: TOKENS.entity.jump.end,
    scopeId: options.listScopeId,
    description: 'Last item',
    keyDownHandler: () => {
      const next = listState.navigate.toLast();
      if (next) scrollTo(next.index);
      return true;
    },
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: 'enter',
    hotkeyToken: TOKENS.entity.open,
    scopeId: options.listScopeId,
    description: 'Open item',
    displayPriority: 4,
    keyDownHandler: () => {
      const item = listState.focus.item();
      if (item?.kind === 'group-header') {
        collection.collapsedGroups.toggle(item.groupId);
        return true;
      }
      if (item?.kind === 'load-more') {
        const index = listState.focus.index();
        void item.loadMore().then(() => {
          listState.navigate.toIndex(index);
          scrollTo(index);
        });
        return true;
      }
      if (tryOpenChannelNotification(false)) return true;
      return activateCurrent({ reason: 'keyboard' }) !== undefined;
    },
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: 'shift+enter',
    scopeId: options.listScopeId,
    description: 'Open item in new split',
    keyDownHandler: () => {
      const item = listState.focus.item();
      if (!item || item.kind !== 'entity') return false;
      if (tryOpenChannelNotification(true)) return true;
      return (
        activateCurrent({
          reason: 'keyboard',
          metadata: { openInNewSplit: true },
        }) !== undefined
      );
    },
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: 'cmd+enter',
    scopeId: options.listScopeId,
    description: 'Focus preview',
    condition: () => panel.handle.isControllerSplit(),
    keyDownHandler: () => {
      const manager = globalSplitManager();
      const viewerId = panel.handle.viewerId();
      if (!viewerId || !manager) return false;
      manager.activateSplit(viewerId);
      manager.returnFocus();
      return true;
    },
    displayPriority: 4,
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: 'x',
    scopeId: options.listScopeId,
    description: 'Toggle select item',
    keyDownHandler: () => {
      const item = listState.focus.item();
      if (!item || !listState.selection.isSelectable(item)) {
        return false;
      }
      listState.selection.toggle(item);
      return true;
    },
    hide: true,
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: 'cmd+a',
    scopeId: options.listScopeId,
    description: 'Toggle select all',
    keyDownHandler: (event) => {
      event?.preventDefault();
      const selectable = listState.items
        .all()
        .filter(listState.selection.isSelectable);
      if (selectable.length === 0) return false;
      if (listState.selection.count() === selectable.length) {
        listState.selection.clear();
      } else {
        listState.selection.set(selectable);
      }
      return true;
    },
  }).withGroup(hotkeys);

  registerHotkey({
    hotkey: 'cmd+k',
    hotkeyToken: TOKENS.global.commandMenu,
    scopeId: options.listScopeId,
    description: () =>
      CommandState.isOpen() ? 'Close command menu' : 'Open command menu',
    condition: () => !CommandState.isOpen(),
    keyDownHandler: (event) => {
      event?.preventDefault();
      const selected = listState.selection
        .selected()
        .filter((row): row is SoupEntityRow => row.kind === 'entity')
        .map((row) => row.entity);
      if (selected.length > 0) {
        analytics.track('command_menu_open', {
          from: 'soup_view_entity_action',
        });
        CommandState.openForEntityAction(selected);
        return true;
      }

      analytics.track('command_menu_open', { from: 'soup_view' });
      CommandState.toggle();
      return true;
    },
    displayPriority: 10,
    hide: CommandState.isOpen,
    runWithInputFocused: true,
  }).withGroup(hotkeys);

  const canClearSelection = () => listState.selection.count() > 0;
  const canCloseSpotlight = () => panel.handle.isSpotLight();
  registerHotkey({
    hotkey: 'escape',
    scopeId: options.listScopeId,
    description: () => {
      if (canClearSelection()) return 'Clear selection';
      if (canCloseSpotlight()) return 'Close spotlight';
      return '';
    },
    condition: () => canClearSelection() || canCloseSpotlight(),
    keyDownHandler: () => {
      if (canClearSelection()) {
        listState.selection.clear();
        return true;
      }
      if (!canCloseSpotlight()) return false;
      panel.handle.toggleSpotlight();
      return true;
    },
    hide: true,
  }).withGroup(hotkeys);

  onCleanup(() => hotkeys.dispose());

  return { scrollTo, fetchMore, navigate };
}
