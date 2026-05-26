import type { SplitContent } from './layoutManager';

const STORAGE_KEY = 'macro:layout';
const STORAGE_VERSION = 1;

export type PersistedSplit = {
  history: SplitContent[];
  index: number;
};

export type PersistedLayout = {
  v: number;
  splits: PersistedSplit[];
};

export function readPersistedLayout(): PersistedLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedLayout;
    if (
      !parsed ||
      parsed.v !== STORAGE_VERSION ||
      !Array.isArray(parsed.splits)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writePersistedLayout(layout: Omit<PersistedLayout, 'v'>): void {
  try {
    const payload: PersistedLayout = { v: STORAGE_VERSION, ...layout };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be full or unavailable; failures are non-fatal.
  }
}

export function clearPersistedLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
