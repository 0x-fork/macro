/// <reference types="../../app/vite-env.d.ts" />

import { getImpl, isInitialized, setImpl, setInitialized } from './shared';

interface User {
  id: string;
  email: string;
  [key: string]: any;
}

let pendingUser: User | null = null;

/**
 * Loads and initializes Datadog RUM + logs. The Datadog SDKs are imported
 * lazily so they stay out of the initial bundle; until this resolves, logging
 * falls back to the console (identical to the previous pre-init behavior).
 */
export async function init(version = import.meta.env.__APP_VERSION__) {
  if (import.meta.hot || isInitialized()) return;

  const impl = await import('./impl');
  if (isInitialized()) return;

  impl.init(version);
  setImpl(impl);
  setInitialized(true);

  if (pendingUser) {
    impl.setUser(pendingUser);
    pendingUser = null;
  }
}

export function setUser(user: User) {
  const impl = getImpl();
  if (impl) {
    impl.setUser(user);
  } else {
    // Applied as soon as init() finishes loading the SDKs.
    pendingUser = user;
  }
}

export { startAction } from './actionTracker';
export { error, log, logger } from './logger';
export { useObserveRouting } from './routingTracker';
