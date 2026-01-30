import { TOKENS } from '@core/hotkey/tokens';
import type { VirtualizerHandle } from 'virtua/solid';
import type { Accessor } from 'solid-js';
import type { SoupState } from '../create-soup-state';
import { registerEntityHotkey } from '../utils';

type UseSoupNavigationHotkeysOptions = {
  scopeId: string;
  soup: SoupState;
  virtualizerHandle: Accessor<VirtualizerHandle | undefined>;
};

export const useSoupNavigationHotkeys = (
  options: UseSoupNavigationHotkeysOptions
) => {
  const { scopeId, soup, virtualizerHandle } = options;

  const navigateAndSelectEntity = (offset: number) => {
    const nextRow = soup.navigate.by(offset);
    if (!nextRow) return true;
    soup.selection.select(nextRow.item);
    virtualizerHandle()?.scrollToIndex(nextRow.index, { align: 'nearest' });
    return true;
  };

  const handleNavigationSelection = (offset: number) => {
    const focusedEntity = soup.focus.item();
    const nextIndex = soup.navigate.peekOffset(offset);

    const selection = soup.selection;

    const nextRow = nextIndex?.item;
    if (!nextRow) return true;

    if (!focusedEntity) {
      navigateAndSelectEntity(offset);
      return true;
    }

    if (selection.count() === 0) {
      selection.toggle(focusedEntity);
      return true;
    }

    if (
      !selection.isSelected(focusedEntity.id) &&
      !selection.isSelected(nextRow.id)
    ) {
      selection.toggle(focusedEntity);
      navigateAndSelectEntity(offset);
      return true;
    }

    if (selection.isSelected(nextRow.id)) {
      selection.toggle(focusedEntity);
      soup.navigate.by(offset);
      return true;
    }

    navigateAndSelectEntity(offset);

    return true;
  };

  // Navigate down - 'j', 'arrowdown'
  registerEntityHotkey({
    hotkey: ['j', 'arrowdown'],
    scopeId,
    description: 'Down',
    hotkeyToken: TOKENS.entity.step.end,
    keyDownHandler: () => {
      const next = soup.navigate.down();

      if (!next) return true;

      virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });

      return true;
    },
    hide: true,
  });

  // Navigate up - 'k', 'arrowup'
  registerEntityHotkey({
    hotkey: ['k', 'arrowup'],
    scopeId,
    hotkeyToken: TOKENS.entity.step.start,
    description: 'Up',
    keyDownHandler: () => {
      const next = soup.navigate.up();

      if (!next) return true;

      virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });

      return true;
    },
    hide: true,
  });

  // Select up - 'shift+arrowup', 'shift+k'
  registerEntityHotkey({
    hotkey: ['shift+arrowup', 'shift+k'],
    scopeId,
    description: 'Select up',
    hotkeyToken: TOKENS.entity.select.start,
    keyDownHandler: () => {
      return handleNavigationSelection(-1);
    },
    hide: true,
  });

  // Select down - 'shift+arrowdown', 'shift+j'
  registerEntityHotkey({
    hotkey: ['shift+arrowdown', 'shift+j'],
    scopeId,
    description: 'Select down',
    hotkeyToken: TOKENS.entity.select.end,
    keyDownHandler: () => {
      return handleNavigationSelection(1);
    },
    hide: true,
  });
};
