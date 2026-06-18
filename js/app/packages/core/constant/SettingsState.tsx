import { useSplitLayout } from '@app/component/split-layout/layout';
import { globalSplitManager } from '@app/signal/splitLayout';
import { isMobile } from '@core/mobile/isMobile';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import { createControlledOpenSignal } from '@core/util/createControlledOpenSignal';
import { createMemo, createSignal } from 'solid-js';

export type SettingsTab =
  | 'Account'
  | 'Subscription'
  | 'Organization'
  | 'Appearance'
  | 'Mobile'
  | 'AI Memory'
  | 'Inbox'
  | 'Shortcuts'
  | 'Mobile App'
  | 'Agent'
  | 'Team'
  | 'Email'
  | 'GitHub'
  | 'Admin';

/** Top-level tabs surfaced in the new SettingsModal. */
export type SettingsModalTab =
  | 'account'
  | 'appearance'
  | 'shortcuts'
  | 'notifications'
  | 'team'
  | 'agents';

export const [activeTabId, setActiveTabId] =
  createSignal<SettingsTab>('Appearance');

export const [settingsModalOpen, setSettingsModalOpen] = createSignal(false);
export const [settingsModalTab, setSettingsModalTab] =
  createSignal<SettingsModalTab>('account');

/**
 * When true, the settings modal hides its chrome and a compact theme picker
 * floats at the bottom-right so the user can preview color changes against the
 * full UI. Toggled on while the user is actively dragging a theme editor slider/
 * swatch so they can see the live effect on the app behind the modal.
 */
export const [themePickerFloating, setThemePickerFloating] =
  createSignal(false);

/** Map legacy split tab id → new modal tab id, so call sites that pass the old name still land on the right tab. */
function legacyTabToModalTab(tab: SettingsTab | undefined): SettingsModalTab {
  switch (tab) {
    case 'Account':
      return 'account';
    case 'Appearance':
      return 'appearance';
    case 'Shortcuts':
      return 'shortcuts';
    case 'Mobile':
    case 'Mobile App':
    case 'Agent':
      return 'agents';
    case 'Team':
    case 'Organization':
      return 'team';
    case 'Email':
    case 'GitHub':
      return 'account';
    default:
      return 'account';
  }
}

// Settings open in a scrim-backed modal by default. The focus-lock signal keeps
// modal focus return consistent with the command menu / launcher.
const [modalOpen, setModalOpen] = createControlledOpenSignal(false, {
  id: 'settings',
});

export type AgentSettingsSubTab = 'connectors' | 'mcp_server';
export const [agentSettingsSubTab, setAgentSettingsSubTab] =
  createSignal<AgentSettingsSubTab>('connectors');

export const useSettingsState = () => {
  // Kept around for any consumer still using split-based settings, but the
  // primary "open settings" entry point now drives the modal.
  const { openWithSplit } = useSplitLayout();

  const getSettingsSplit = () => {
    const splitManager = globalSplitManager();
    if (!splitManager) return undefined;
    return splitManager.splits().find((split) => {
      const content = split.content;
      return content.type === 'component' && content.id === 'settings';
    });
  };

  const splitOpen = createMemo(() => getSettingsSplit() !== undefined);

  // Settings are considered open whether shown as a modal or docked in a split.
  const isOpen = createMemo(() => modalOpen() || splitOpen());

  const _focusSettingsPanel = () => {
    if (isTouchDevice()) return;
    setTimeout(() => {
      const settingsSplit = getSettingsSplit();
      if (!settingsSplit) return;
      const settingsPanel = document.querySelector<HTMLElement>(
        `[data-split-id="${settingsSplit.id}"] [data-settings-panel]`
      );
      settingsPanel?.focus({ preventScroll: true });
    }, 10);
  };

  // Default activation: open settings in a modal overlay. Mobile keeps the
  // full-screen split behavior since the modal is sized for desktop.
  const openSettings = (activeTabId?: SettingsTab) => {
    if (isMobile()) {
      openSettingsInSplit(activeTabId);
      return;
    }
    if (activeTabId) setActiveTabId(activeTabId);
    setSettingsModalTab(legacyTabToModalTab(activeTabId));
    setModalOpen(true);
  };

  // Opt-in: dock settings into the split layout (the pre-modal behavior).
  const openSettingsInSplit = (activeTabId?: SettingsTab) => {
    if (activeTabId) {
      setActiveTabId(activeTabId);
      setSettingsModalTab(legacyTabToModalTab(activeTabId));
    }
    openWithSplit(
      { type: 'component', id: 'settings' },
      {
        activate: true,
        // Single settings split only: getSettingsSplit/removeSettingsSplit
        // assume one exists, so reuse an existing one instead of duplicating.
        allowDuplicate: false,
        preferNewSplit: true,
        mergeHistory: false,
      }
    );
    _focusSettingsPanel();
  };

  const closeModal = () => {
    setModalOpen(false);
    setThemePickerFloating(false);
  };

  const removeSettingsSplit = () => {
    const settingsSplit = getSettingsSplit();
    if (settingsSplit) {
      globalSplitManager()?.removeSplit(settingsSplit.id);
    }
  };

  const closeSettings = () => {
    if (modalOpen()) setModalOpen(false);
    removeSettingsSplit();
    setThemePickerFloating(false);
  };

  // Promote the modal into the split layout: close the overlay and dock it.
  const moveSettingsToSplit = (activeTabId?: SettingsTab) => {
    setModalOpen(false);
    setThemePickerFloating(false);
    openSettingsInSplit(activeTabId);
  };

  // Pop the docked split back out into the modal. The split is removed so it
  // doesn't keep occupying layout space — the inverse of moveSettingsToSplit.
  const moveSettingsToModal = (activeTabId?: SettingsTab) => {
    if (activeTabId) {
      setActiveTabId(activeTabId);
      setSettingsModalTab(legacyTabToModalTab(activeTabId));
    }
    removeSettingsSplit();
    setModalOpen(true);
  };

  // Focus-aware toggle: bring settings to the user rather than destroying it,
  // and only close when settings is what they're actually looking at.
  const toggleSettings = () => {
    // Modal takes priority: if it's open, close it.
    if (modalOpen()) {
      setModalOpen(false);
      return;
    }

    const settingsSplit = getSettingsSplit();
    if (settingsSplit) {
      const manager = globalSplitManager();
      // Docked but not the active split → bring focus to it instead of closing.
      if (manager && manager.activeSplitId() !== settingsSplit.id) {
        manager.activateSplit(settingsSplit.id);
        _focusSettingsPanel();
        return;
      }
      // Docked and already focused → close it.
      manager?.removeSplit(settingsSplit.id);
      return;
    }

    // Nothing open → open the modal (mobile falls back to split internally).
    openSettings();
  };

  return {
    settingsOpen: isOpen,
    settingsModalOpen: modalOpen,
    settingsSplitOpen: splitOpen,
    openSettings,
    openSettingsInSplit,
    closeSettings,
    closeModal,
    moveSettingsToSplit,
    moveSettingsToModal,
    activeTabId,
    setActiveTabId,
    toggleSettings,
    settingsModalTab,
    setSettingsModalTab,
    themePickerFloating,
    setThemePickerFloating,
    // Legacy split-based helpers kept for callers that need them.
    openSettingsSplit: () =>
      openWithSplit({ type: 'component', id: 'settings' }, { activate: true }),
    getSettingsSplit,
  };
};
