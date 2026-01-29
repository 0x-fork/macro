/**
 * Signal Configuration System
 *
 * Manages persisted toggles for email priority/depriority settings.
 * These determine what emails are classified as "signal" vs "noise".
 */

import { makePersisted } from '@solid-primitives/storage';
import { createMemo, createSignal, type Accessor } from 'solid-js';

// ============================================================================
// Types
// ============================================================================

type SignalConfig<T extends string> = {
  key: T;
  label: string;
  defaultValue: boolean;
};

type SignalToggle<T extends string> = SignalConfig<T> & {
  enabled: Accessor<boolean>;
  setEnabled: (value: boolean) => void;
};

// ============================================================================
// Toggle Factory
// ============================================================================

const makeToggle = (storageKey: string, defaultValue: boolean) =>
  makePersisted(createSignal(defaultValue), { name: storageKey });

const toStorageKey = (scope: string, key: string) =>
  `signalFilter_${scope}_${key.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

const createSignalToggles = <T extends string>(
  scope: string,
  configs: SignalConfig<T>[]
): SignalToggle<T>[] =>
  configs.map((config) => {
    const [enabled, setEnabled] = makeToggle(
      toStorageKey(scope, config.key),
      config.defaultValue
    );
    return { ...config, enabled, setEnabled };
  });

// ============================================================================
// Configuration Definitions
// ============================================================================

/** Labels that indicate priority emails (signal) */
const PRIORITY_LABEL_CONFIGS: SignalConfig<string>[] = [
  { key: 'CATEGORY_PERSONAL', label: 'Personal', defaultValue: true },
  { key: 'SENT', label: 'Sent', defaultValue: true },
  { key: 'IMPORTANT', label: 'Important', defaultValue: false },
];

/** Metadata keys we care about (subset of SoupEmailThreadPreviewMetadata) */
export type EmailMetadataKey = 'knownSender' | 'tabular' | 'genericSender';

/** Metadata that indicates priority emails (signal) */
const PRIORITY_METADATA_CONFIGS: SignalConfig<EmailMetadataKey>[] = [
  { key: 'knownSender', label: 'Known Sender', defaultValue: false },
];

/** Labels that indicate depriority emails (noise) */
const DEPRIORITY_LABEL_CONFIGS: SignalConfig<string>[] = [
  { key: 'CATEGORY_UPDATES', label: 'Updates', defaultValue: true },
  { key: 'CATEGORY_PROMOTIONS', label: 'Promotions', defaultValue: true },
  { key: 'CATEGORY_SOCIAL', label: 'Social', defaultValue: true },
  { key: 'CATEGORY_FORUMS', label: 'Forums', defaultValue: true },
];

/** Metadata that indicates depriority emails (noise) */
const DEPRIORITY_METADATA_CONFIGS: SignalConfig<EmailMetadataKey>[] = [
  { key: 'tabular', label: 'Tabular', defaultValue: false },
  { key: 'genericSender', label: 'Generic Sender', defaultValue: false },
];

// ============================================================================
// Lazy Initialization (avoids creating signals at module load time)
// ============================================================================

let _priorityLabelToggles: SignalToggle<string>[] | null = null;
let _priorityMetadataToggles: SignalToggle<EmailMetadataKey>[] | null = null;
let _depriorityLabelToggles: SignalToggle<string>[] | null = null;
let _depriorityMetadataToggles: SignalToggle<EmailMetadataKey>[] | null = null;

let _priorityLabels: Accessor<Set<string>> | null = null;
let _depriorityLabels: Accessor<Set<string>> | null = null;
let _priorityMetadata: Accessor<Set<EmailMetadataKey>> | null = null;
let _depriorityMetadata: Accessor<Set<EmailMetadataKey>> | null = null;

/** Priority label toggles (persisted) - lazy initialized */
export const PRIORITY_LABEL_TOGGLES = (): SignalToggle<string>[] => {
  if (!_priorityLabelToggles) {
    _priorityLabelToggles = createSignalToggles(
      'priority_label',
      PRIORITY_LABEL_CONFIGS
    );
  }
  return _priorityLabelToggles;
};

/** Priority metadata toggles (persisted) - lazy initialized */
export const PRIORITY_METADATA_TOGGLES =
  (): SignalToggle<EmailMetadataKey>[] => {
    if (!_priorityMetadataToggles) {
      _priorityMetadataToggles = createSignalToggles(
        'priority_metadata',
        PRIORITY_METADATA_CONFIGS
      );
    }
    return _priorityMetadataToggles;
  };

/** Depriority label toggles (persisted) - lazy initialized */
export const DEPRIORITY_LABEL_TOGGLES = (): SignalToggle<string>[] => {
  if (!_depriorityLabelToggles) {
    _depriorityLabelToggles = createSignalToggles(
      'depriority_label',
      DEPRIORITY_LABEL_CONFIGS
    );
  }
  return _depriorityLabelToggles;
};

/** Depriority metadata toggles (persisted) - lazy initialized */
export const DEPRIORITY_METADATA_TOGGLES =
  (): SignalToggle<EmailMetadataKey>[] => {
    if (!_depriorityMetadataToggles) {
      _depriorityMetadataToggles = createSignalToggles(
        'depriority_metadata',
        DEPRIORITY_METADATA_CONFIGS
      );
    }
    return _depriorityMetadataToggles;
  };

// ============================================================================
// Computed Sets (Reactive based on toggles) - lazy initialized
// ============================================================================

/** Labels that mark emails as priority (computed from enabled toggles) */
export const PRIORITY_LABELS = (): Set<string> => {
  if (!_priorityLabels) {
    _priorityLabels = createMemo(
      () =>
        new Set(
          PRIORITY_LABEL_TOGGLES()
            .filter(({ enabled }) => enabled())
            .map(({ key }) => key)
        )
    );
  }
  return _priorityLabels();
};

/** Labels that mark emails as depriority (computed from enabled toggles) */
export const DEPRIORITY_LABELS = (): Set<string> => {
  if (!_depriorityLabels) {
    _depriorityLabels = createMemo(
      () =>
        new Set(
          DEPRIORITY_LABEL_TOGGLES()
            .filter(({ enabled }) => enabled())
            .map(({ key }) => key)
        )
    );
  }
  return _depriorityLabels();
};

/** Metadata keys that mark emails as priority (computed from enabled toggles) */
export const PRIORITY_METADATA = (): Set<EmailMetadataKey> => {
  if (!_priorityMetadata) {
    _priorityMetadata = createMemo(
      () =>
        new Set<EmailMetadataKey>(
          PRIORITY_METADATA_TOGGLES()
            .filter(({ enabled }) => enabled())
            .map(({ key }) => key)
        )
    );
  }
  return _priorityMetadata();
};

/** Metadata keys that mark emails as depriority (computed from enabled toggles) */
export const DEPRIORITY_METADATA = (): Set<EmailMetadataKey> => {
  if (!_depriorityMetadata) {
    _depriorityMetadata = createMemo(
      () =>
        new Set<EmailMetadataKey>(
          DEPRIORITY_METADATA_TOGGLES()
            .filter(({ enabled }) => enabled())
            .map(({ key }) => key)
        )
    );
  }
  return _depriorityMetadata();
};

// ============================================================================
// Export toggles for settings UI
// ============================================================================

export type { SignalToggle };
