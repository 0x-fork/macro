/// <reference types="../../app/vite-env.d.ts" />

import { datadogLogs } from '@datadog/browser-logs';
import { isInitialized, setInitialized } from './shared';

const clientToken = import.meta.env.VITE_DD_WEB_APP_TOKEN;
const env = import.meta.env.MODE === 'production' ? 'prod' : 'dev';
const service = 'web-app';
const site = 'us5.datadoghq.com';

export function init(version = import.meta.env.__APP_VERSION__) {
  if (import.meta.hot || isInitialized()) return;

  datadogLogs.init({
    clientToken,
    env,
    version,
    service,
    site,
    // Catch exceptions without RUM: forwards uncaught exceptions, unhandled
    // promise rejections, and failed network requests (XHR/fetch) to Datadog
    // as error-level logs (with stack traces).
    forwardErrorsToLogs: true,
    // Also forward explicit console.error() calls.
    forwardConsoleLogs: ['error'],
    // Forward browser Reporting API entries (CSP violations, deprecations,
    // interventions).
    forwardReports: 'all',
    telemetrySampleRate: 0,
    beforeSend: (event, _context) => {
      if (event.message.includes('unfurl-service')) return false;

      // these are from VList and can be ignored: https://github.com/inokawa/virtua?tab=readme-ov-file#what-is-resizeobserver-loop-completed-with-undelivered-notifications-error
      if (
        event.message.includes(
          'ResizeObserver loop completed with undelivered notifications'
        )
      )
        return false;

      return true;
    },
  });

  setInitialized(true);
}

interface User {
  id: string;
  email: string;
  [key: string]: any;
}
export function setUser(user: User) {
  datadogLogs.setUser(user);
}

export { error, log, logger } from './logger';
