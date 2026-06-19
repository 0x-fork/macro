/// <reference types="../../app/vite-env.d.ts" />

import { getImpl, isInitialized, setImpl, setInitialized } from './shared';

interface User {
  id: string;
  email: string;
  [key: string]: any;
}

// init() loads the Datadog SDK lazily, so setUser()/clearUser() can run before
// it is ready. Buffer the latest user and apply it once initialized.
let pendingUser: User | undefined;

/**
 * Loads and initializes Datadog logs. The Datadog SDK is imported lazily (see
 * impl.ts) so it stays out of the initial bundle; until this resolves, logging
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
    pendingUser = undefined;
  }
}

export function setUser(user: User) {
  const impl = getImpl();
  if (impl) {
    impl.setUser(user);
  } else {
    // Applied as soon as init() finishes loading the SDK.
    pendingUser = user;
  }
}

// Drop the user from log context on logout so logs aren't attributed to a
// signed-out user. Mirrors the analytics.reset() in the logout flow.
export function clearUser() {
  pendingUser = undefined;
  const impl = getImpl();
  if (impl) impl.clearUser();
}

export { error, log, logger } from './logger';
