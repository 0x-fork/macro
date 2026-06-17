import type { Phase } from './document-init-machine';

export type WalContext = {
  count: number;
  dirty: number;
  mostRecentEdit?: number;
};

export type SyncLogContext = {
  wal?: WalContext;
  initMachineState?: Phase;
  misc?: Record<string, unknown>;
};

export function logSyncService({
  documentId,
  level,
  context,
  message,
}: {
  documentId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  context: SyncLogContext;
  message: string;
}): void {
  if (level === 'debug') return;
  console[level === 'info' ? 'log' : level](
    { documentId, t: Date.now(), ...context },
    message
  );
}
