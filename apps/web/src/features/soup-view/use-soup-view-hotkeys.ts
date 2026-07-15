import {
  type ListActivateOptions,
  type ListActivation,
  useList,
} from '@app/components/list';
import type { ListView } from '@app/constants/list-views';
import { openEntityInSplitFromUnifiedList } from '@app/features/next-soup/utils';
import { type SoupItem, useSoupCollection } from '@app/features/soup-list';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { entityIdSelector } from '@core/dom-selectors';
import { createHotkeyGroup, registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import type { EntityData } from '@entity';
import { type Accessor, onCleanup, type Setter } from 'solid-js';
import type { VirtualizerHandle } from 'virtua/solid';

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

type SoupTab = { value: string; label?: unknown };

type UseSoupViewHotkeysOptions = {
  listScopeId: string;
  scopeId?: string;
  view: ListView;
  root: Accessor<HTMLElement | undefined>;
  virtualizer: Accessor<VirtualizerHandle | undefined>;
  previewOpen: Accessor<boolean>;
  setPreviewOpen: Setter<boolean>;
  activate: (activation: ListActivation<SoupItem>) => void;
  tabs: Accessor<readonly SoupTab[]>;
  applyTabPreset: (tabId: string) => boolean;
  showSort: Accessor<boolean>;
  setSortOpen: Setter<boolean>;
  canNavigate?: Accessor<boolean>;
  onNavigate?: (item: SoupItem, index: number) => void;
};

const entityFromItem = (item: SoupItem | undefined): EntityData | undefined =>
  item?.kind === 'entity' ? item.entity : undefined;

/** Owns Soup keyboard commands and their mounted/persistent lifetimes. */
export function useSoupViewHotkeys(options: UseSoupViewHotkeysOptions) {
  const panel = useSplitPanelOrThrow();
  const collection = useSoupCollection();
  const { dataSource, state: listState } = useList<SoupItem>();

  const scrollTo = (index: number) =>
    options.virtualizer()?.scrollToIndex(index, { align: 'nearest' });

  const fetchMore = async () => {
    if (!dataSource.hasMore() || dataSource.isLoadingMore()) {
      return;
    }
    await dataSource.loadMore();
  };

  const canNavigate = () => {
    if (options.canNavigate) return options.canNavigate();
    const contentType = panel.handle.content().type;
    const referredFrom = panel.handle.referredFrom();
    return (
      contentType === 'component' ||
      contentType === 'project' ||
      referredFrom === 'inbox' ||
      referredFrom === 'mail'
    );
  };

  const navigate = (offset: number) => {
    if (!canNavigate()) return false;
    const count = listState.items.count();
    const next = listState.navigate.by(offset, { reason: 'keyboard' });
    if (!next) {
      if (offset > 0) void fetchMore();
      return true;
    }

    scrollTo(next.index);
    options.onNavigate?.(next.item, next.index);

    const contentType = panel.handle.content().type;
    if (
      next.item.kind === 'entity' &&
      contentType !== 'component' &&
      contentType !== 'project'
    ) {
      void openEntityInSplitFromUnifiedList(next.item.entity, {
        splitHandle: panel.handle,
        referredFrom: options.view,
        mergeHistory: true,
      });
    }

    if (offset > 0 && next.index >= count - 1 - LOAD_MORE_DISTANCE_FROM_END) {
      void fetchMore();
    }
    return true;
  };

  const navigateAndSelect = (offset: number) => {
    const previous = listState.focus.item();
    const next = listState.navigate.peekOffset(offset);
    if (!next || next.item.id === previous?.id) return true;

    if (previous && listState.selection.isSelectable(previous)) {
      listState.selection.toggle(previous);
    }
    const result = listState.navigate.by(offset, {
      reason: 'keyboard',
    });
    if (result && listState.selection.isSelectable(result.item)) {
      listState.selection.select(result.item);
      scrollTo(result.index);
    }
    return true;
  };

  const setFocusedGroupExpanded = (expanded: boolean): boolean | undefined => {
    const item = listState.focus.item();
    if (!item || item.kind !== 'group-header') return undefined;
    const currentlyExpanded = collection.disclosure.isExpanded(item.groupId);
    if (currentlyExpanded === expanded) return false;
    collection.disclosure.setExpanded(item.groupId, expanded);
    return true;
  };

  const getCollapsibleToggle = () => {
    const entity = entityFromItem(listState.focus.item());
    if (!entity) return;
    const element = options.root()?.querySelector(entityIdSelector(entity.id));
    return element?.querySelector(
      'button[data-collapsible-toggle]'
    ) as HTMLButtonElement | null;
  };

  const activateCurrent = (activateOptions: ListActivateOptions) => {
    const item = listState.focus.item();
    const index = listState.focus.index();
    if (!item || index < 0) return;
    const activation: ListActivation<SoupItem> = {
      item,
      index,
      reason: activateOptions.reason ?? 'programmatic',
      metadata: activateOptions.metadata,
    };
    options.activate(activation);
    return activation;
  };

  const cycleTab = (offset: number) => {
    const tabs = options.tabs();
    if (tabs.length === 0) return false;
    const current = tabs.findIndex(
      (tab) => tab.value === collection.activeTab()
    );
    const next = (Math.max(current, 0) + offset + tabs.length) % tabs.length;
    return options.applyTabPreset(tabs[next].value);
  };

  // J/K intentionally remain registered after the rendered list unmounts so a
  // detail entry can continue navigating its originating collection. The
  // split/session owner determines when the scope itself is destroyed.
  registerHotkey({
    hotkey: 'j',
    hotkeyToken: TOKENS.entity.step.end,
    scopeId: options.scopeId ?? panel.splitHotkeyScope,
    description: 'Down',
    condition: canNavigate,
    keyDownHandler: () => navigate(1),
    hide: true,
  });
  registerHotkey({
    hotkey: 'k',
    hotkeyToken: TOKENS.entity.step.start,
    scopeId: options.scopeId ?? panel.splitHotkeyScope,
    description: 'Up',
    condition: canNavigate,
    keyDownHandler: () => navigate(-1),
    hide: true,
  });

  const hotkeys = createHotkeyGroup();

  for (
    let index = 0;
    index < Math.min(options.tabs().length, NUMBER_TAB_HOTKEYS.length);
    index++
  ) {
    const tab = options.tabs()[index];
    const hotkey = NUMBER_TAB_HOTKEYS[index];
    if (!tab || !hotkey) continue;
    registerHotkey({
      hotkey,
      scopeId: options.listScopeId,
      description:
        typeof tab.label === 'string' ? `Open ${tab.label}` : 'Open tab',
      keyDownHandler: () => options.applyTabPreset(tab.value),
      hide: true,
    }).withGroup(hotkeys);
  }

  registerHotkey({
    hotkey: 'tab',
    scopeId: options.listScopeId,
    description: 'Next tab',
    condition: () => options.tabs().length > 0,
    keyDownHandler: (event) => {
      event?.preventDefault();
      return cycleTab(1);
    },
    hide: true,
  }).withGroup(hotkeys);
  registerHotkey({
    hotkey: 'shift+tab',
    scopeId: options.listScopeId,
    description: 'Previous tab',
    condition: () => options.tabs().length > 0,
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
    condition: options.showSort,
    keyDownHandler: () => {
      options.setSortOpen(true);
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
      if (!collection.disclosure.isExpanded(item.groupId)) return false;
      collection.disclosure.collapse(item.groupId);
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
    hide: true,
  }).withGroup(hotkeys);
  registerHotkey({
    hotkey: 'home',
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
    hotkey: 'end',
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
    scopeId: options.listScopeId,
    description: 'Open item',
    keyDownHandler: () => {
      const item = listState.focus.item();
      if (item?.kind === 'group-header') {
        collection.disclosure.toggle(item.groupId);
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
    description: 'Open focused item',
    keyDownHandler: () => {
      const item = listState.focus.item();
      if (item?.kind === 'load-more') {
        void item.loadMore();
        return true;
      }
      return (
        activateCurrent({
          reason: 'keyboard',
          metadata: {
            openFocused: true,
            previewOpen: options.previewOpen(),
          },
        }) !== undefined
      );
    },
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
    hotkey: 'escape',
    scopeId: options.listScopeId,
    description: 'Clear selection',
    keyDownHandler: () => {
      if (listState.selection.count() === 0) return false;
      listState.selection.clear();
      return true;
    },
    hide: true,
  }).withGroup(hotkeys);
  registerHotkey({
    hotkey: 'space',
    hotkeyToken: TOKENS.unifiedList.togglePreview,
    scopeId: panel.splitHotkeyScope,
    description: 'Toggle preview',
    keyDownHandler: () => {
      options.setPreviewOpen((open) => !open);
      return true;
    },
  }).withGroup(hotkeys);

  onCleanup(() => hotkeys.dispose());

  return { scrollTo, fetchMore, navigate };
}
