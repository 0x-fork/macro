import { useSplitLayout } from '@app/component/split-layout/layout';
import { globalSplitManager } from '@app/signal/splitLayout';
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
  | 'Team';

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
export const [themePickerFloating, setThemePickerFloating] = createSignal(false);

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
    default:
      return 'account';
  }
}

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

  const isOpen = createMemo(() => settingsModalOpen());

  const openSettings = (activeTabId?: SettingsTab) => {
    if (activeTabId) setActiveTabId(activeTabId);
    setSettingsModalTab(legacyTabToModalTab(activeTabId));
    setSettingsModalOpen(true);
  };

  const closeSettings = () => {
    setSettingsModalOpen(false);
    setThemePickerFloating(false);
  };

  const toggleSettings = () => {
    if (isOpen()) closeSettings();
    else openSettings();
  };

  return {
    settingsOpen: isOpen,
    openSettings,
    closeSettings,
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
