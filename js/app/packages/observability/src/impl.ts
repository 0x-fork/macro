/// <reference types="../../app/vite-env.d.ts" />

// All code that touches the Datadog SDK lives here. This module is only loaded
// via dynamic import from init() so @datadog/browser-logs stays out of the
// initial bundle; everything else in the package goes through shared.ts
// getImpl() and falls back to the console until this module resolves.

import { datadogLogs } from '@datadog/browser-logs';

const clientToken = import.meta.env.VITE_DD_WEB_APP_TOKEN;
const env = import.meta.env.MODE === 'production' ? 'prod' : 'dev';
const service = 'web-app';
const site = 'us5.datadoghq.com';

// Route intake through the first-party analytics proxy (Cloudflare Worker) so
// ad blockers / tracking protection don't drop logs the way they block
// requests sent straight to *.datadoghq.com. The worker maps the `/i/dd`
// prefix to the us5 browser intake origin; see js/analytics-proxy.
const proxy = (options: { path: string; parameters: string }) =>
  `https://macro-prox.macroverse.workers.dev/i/dd${options.path}?${options.parameters}`;

export function init(version: string) {
  datadogLogs.init({
    clientToken,
    env,
    version,
    service,
    site,
    proxy,
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
}

export function setUser(user: {
  id: string;
  email: string;
  [key: string]: any;
}) {
  datadogLogs.setUser(user);
}

export function clearUser() {
  datadogLogs.clearUser();
}

export function logMessage(
  message: string,
  messageContext: object | undefined,
  level: 'debug' | 'info' | 'warn' | 'error',
  error?: Error
) {
  datadogLogs.logger.log(message, messageContext, level, error);
}

export function logError(error: Error, errorContext?: object) {
  datadogLogs.logger.error(error.message || error.name, errorContext, error);
}
