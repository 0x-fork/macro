import { createSignal } from 'solid-js';

const DEFAULT_SETTINGS_PANEL_SIZE = 600;

// Simple boolean signal for settings panel collapsed state
// Default to collapsed (true)
export const [isSettingsPanelOpen, setIsSettingsPanelOpen] =
  createSignal(false);

// Settings panel size for resize
