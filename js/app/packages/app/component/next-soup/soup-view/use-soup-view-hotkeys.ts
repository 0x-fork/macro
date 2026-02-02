import {
  konsoleOpen,
  resetKonsoleMode,
  setKonsoleMode,
  toggleKonsoleVisibility,
} from '@app/component/command/state';
import {
  resetCommandCategoryIndex,
  searchCategories,
  setCommandCategoryIndex,
  setKonsoleContextInformation,
} from '@app/component/command/KonsoleItem';
import { openEntityInSplitFromUnifiedList } from '@app/component/soupContextHelpers';
import type { SplitHandle } from '@app/component/split-layout/layoutManager';
import { activeScope, hotkeyScopeTree } from '@core/hotkey/state';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { getHotkeyCommand, runCommand } from '@core/hotkey/utils';
import { getActualTarget } from '@core/util/getActualTarget';
import { isInteractiveElement } from '@core/util/isInteractiveElement';
import { isSearchEntity } from '@macro-entity';
import type { Accessor } from 'solid-js';
import { onCleanup } from 'solid-js';
import type { VirtualizerHandle } from 'virtua/solid';
import type { SoupState } from '../create-soup-state';
import { registerEntityHotkey, splitIdToSoupViewRef } from '../utils';

type UseSoupViewHotkeysOptions = {
  splitId: string;
  scopeId: string;
  domRef: Accessor<HTMLElement | undefined>;
  soup: SoupState;
  splitHandle: SplitHandle;
  virtualizerHandle: Accessor<VirtualizerHandle | undefined>;
  previewState: Accessor<boolean>;
  getSplitCount: () => number;
};

export const useSoupViewHotkeys = (options: UseSoupViewHotkeysOptions) => {
  const {
    splitId,
    scopeId,
    domRef,
    soup,
    splitHandle,
    virtualizerHandle,
    previewState,
    getSplitCount,
  } = options;

  // Register this soup view in the global map for hotkey forwarding
  splitIdToSoupViewRef.set(splitId, { domRef, soup });

  onCleanup(() => {
    splitIdToSoupViewRef.delete(splitId);
  });

  const splitIsUnifiedList = () => splitHandle.content().id === 'unified-list';

  // home - Jump to top of list
  registerEntityHotkey({
    hotkey: ['home'],
    scopeId,
    hotkeyToken: TOKENS.entity.jump.home,
    description: 'Go to top of list',
    keyDownHandler: () => {
      const next = soup.navigate.toFirst();
      if (next) {
        virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });
      }
      return true;
    },
    hide: true,
  });

  // g g - Jump to top of list (vim-style command scope)
  const {
    registerHotkeyReturn: topGScope,
    globalRegisterHotkeyReturn: topGScopeGlobal,
  } = registerEntityHotkey({
    hotkey: ['g'],
    scopeId,
    description: 'Go to top of list',
    keyDownHandler: () => true,
    activateCommandScope: true,
    hide: true,
  });

  registerEntityHotkey({
    hotkey: ['g'],
    scopeId: topGScope.commandScopeId,
    globalCommandScope: topGScopeGlobal.commandScopeId,
    description: 'Go to top of list',
    keyDownHandler: () => {
      const next = soup.navigate.toFirst();
      if (next) {
        virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });
      }
      return true;
    },
  });

  // shift+g, end - Jump to bottom of list
  registerEntityHotkey({
    hotkey: ['shift+g', 'end'],
    scopeId,
    hotkeyToken: TOKENS.entity.jump.end,
    description: 'Go to bottom of list',
    keyDownHandler: () => {
      const next = soup.navigate.toLast();
      if (next) {
        virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });
      }
      return true;
    },
    hide: true,
  });

  // enter - Open entity in split
  registerEntityHotkey({
    hotkey: ['enter'],
    hotkeyToken: TOKENS.entity.open,
    scopeId,
    description: 'Open',
    hide: true,
    keyDownHandler: () => {
      const entity = soup.focus.item();
      if (!entity) return false;

      const contentHitData = isSearchEntity(entity)
        ? entity.search.contentHitData
        : undefined;
      // Only navigate to specific location if there's exactly one hit
      const location =
        contentHitData?.length === 1 ? contentHitData[0]?.location : undefined;

      openEntityInSplitFromUnifiedList(entity, {
        splitHandle,
        location,
      });
      return true;
    },
    canExecuteKeyDownHandler: ({ keyboardEvent }) => {
      if (keyboardEvent) {
        const target = getActualTarget(keyboardEvent);

        const listEl = domRef();
        if (listEl?.contains(target)) {
          return true;
        }

        if (isInteractiveElement(target)) {
          return false;
        }
      }
      return true;
    },
    displayPriority: 4,
    registrationType: 'add',
  });

  // cmd+enter - Focus preview block
  registerEntityHotkey({
    hotkey: ['cmd+enter'],
    scopeId,
    description: 'Focus Preview',
    keyDownHandler: () => {
      const preview = previewState();
      const entity = soup.focus.item();
      if (!entity) return false;

      if (preview) {
        // focus inside preview block
        const blockEl = document.getElementById(`block-${entity.id}`);
        if (blockEl) {
          // TODO: use state instead to determine when preview block can receive focus
          blockEl.setAttribute('data-allow-focus-in-preview', '');

          blockEl.focus();
          const getEnterCommand = () => {
            const currentActiveScope = activeScope();
            if (!currentActiveScope) return undefined;
            const activeScopeNode = hotkeyScopeTree.get(currentActiveScope);
            if (!activeScopeNode) return undefined;
            if (activeScopeNode?.type !== 'dom') return;
            const dom = activeScopeNode.element;
            const closestBlockScope = dom.closest(`[id="block-${entity.id}"]`);
            if (
              !closestBlockScope ||
              !(closestBlockScope instanceof HTMLElement)
            )
              return;
            const blockScopeId = closestBlockScope.dataset.hotkeyScope;
            if (!blockScopeId) return undefined;

            return getHotkeyCommand(blockScopeId, 'enter');
          };
          const command = getEnterCommand();
          if (command) {
            runCommand(command);
          }
        }
        return true;
      }

      openEntityInSplitFromUnifiedList(entity, {
        splitHandle,
      });
      return true;
    },
    displayPriority: 4,
  });

  // x - Toggle select item
  registerEntityHotkey({
    hotkey: ['x'],
    scopeId,
    description: 'Toggle select item',
    keyDownHandler: () => {
      const entity = soup.focus.item();
      if (!entity) return false;
      soup.selection.toggle(entity);
      return true;
    },
    displayPriority: 10,
  });

  // cmd+k - Open command menu with selection context
  registerHotkey({
    scopeId,
    description: () => {
      return konsoleOpen() ? 'Close command menu' : 'Open command menu';
    },
    hotkey: 'cmd+k',
    condition: () => !konsoleOpen(),
    keyDownHandler: (e) => {
      e?.preventDefault();
      const multiSelectEntities = soup.selection.selected();

      const hasSelection = multiSelectEntities.length > 0;

      if (hasSelection) {
        setKonsoleMode('SELECTION_MODIFICATION');
        const selectionIndex = searchCategories.getCategoryIndex('Selection');

        if (selectionIndex === undefined) return false;

        setCommandCategoryIndex(selectionIndex);

        searchCategories.showCategory('Selection');

        setKonsoleContextInformation({
          multiSelectEntities: multiSelectEntities.slice(),
        });

        toggleKonsoleVisibility();
        return true;
      }
      searchCategories.hideCategory('Selection');
      resetCommandCategoryIndex();
      resetKonsoleMode();
      return false;
    },
    displayPriority: 10,
    hide: konsoleOpen,
    runWithInputFocused: true,
  });

  // escape - Multi-purpose: Clear selection / Close spotlight / Close split / Go home
  const clearMultiCondition = () => soup.selection.count() > 0;
  const closeSpotlightCondition = () => splitHandle.isSpotLight();
  const goHomeCondition = () => !splitIsUnifiedList();
  const closeSplitCondition = () => splitIsUnifiedList() && getSplitCount() > 1;

  const escapeDescription = () => {
    if (clearMultiCondition()) {
      return 'Clear multi selection';
    }
    if (closeSpotlightCondition()) {
      return 'Close spotlight';
    }
    if (closeSplitCondition()) {
      return 'Close split';
    }
    if (goHomeCondition()) {
      return 'Go home';
    }
    return '';
  };

  registerHotkey({
    hotkey: ['escape'],
    scopeId,
    description: escapeDescription,
    condition: () =>
      clearMultiCondition() ||
      closeSpotlightCondition() ||
      closeSplitCondition() ||
      goHomeCondition(),
    keyDownHandler: () => {
      if (clearMultiCondition()) {
        const length = soup.selection.count();
        soup.selection.clear();
        return length > 1;
      }
      if (closeSpotlightCondition()) {
        splitHandle.toggleSpotlight();
        return true;
      }
      if (closeSplitCondition()) {
        splitHandle.close();
        return true;
      }
      if (goHomeCondition()) {
        splitHandle.replace({
          next: { type: 'component', id: 'unified-list' },
          referredFrom: 'unified-list',
        });
        return true;
      }
      return false;
    },
  });
};
