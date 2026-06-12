/// <reference types="../../app/vite-env.d.ts" />

// All code that touches the Datadog SDKs lives here. This module is only
// loaded via dynamic import from init() so the SDKs stay out of the initial
// bundle; everything else in the package goes through shared.ts getImpl().

import { SERVER_HOSTS } from '@core/constant/servers';
import { datadogLogs } from '@datadog/browser-logs';
import { datadogRum } from '@datadog/browser-rum';

const applicationId = import.meta.env.VITE_DD_WEB_APP_ID;
const clientToken = import.meta.env.VITE_DD_WEB_APP_TOKEN;
const env = import.meta.env.MODE === 'production' ? 'prod' : 'dev';
const service = 'web-app';
const site = 'us5.datadoghq.com';

const tracingHosts =
  env === 'prod'
    ? [
        SERVER_HOSTS['auth-service'],
        SERVER_HOSTS['cognition-service'],
        SERVER_HOSTS['document-storage-service'],
        SERVER_HOSTS['email-service'],
        SERVER_HOSTS['notification-service'],
      ]
    : Object.values(SERVER_HOSTS);

export function init(version: string) {
  datadogRum.init({
    applicationId,
    clientToken,
    env,
    version,
    service,
    site,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 0,
    allowFallbackToLocalStorage: true,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    actionNameAttribute: 'data-action-name',
    defaultPrivacyLevel: 'mask',
    excludedActivityUrls: [
      (url) => new URL(url).hostname.includes('analytics'),
    ],
    allowedTracingUrls: tracingHosts.map((host) => ({
      match: host,
      propagatorTypes: ['tracecontext'],
    })),
    trackViewsManually: true,
    beforeSend: (event, _context) => {
      if (event.type === 'resource' && event.status_code !== 200) {
        if (event.resource.url.includes('unfurl-service')) return false;
      }

      // these are from VList and can be ignored: https://github.com/inokawa/virtua?tab=readme-ov-file#what-is-resizeobserver-loop-completed-with-undelivered-notifications-error
      if (
        event.type === 'error' &&
        event.error.message.includes(
          'ResizeObserver loop completed with undelivered notifications'
        )
      )
        return false;

      return true;
    },
  });

  datadogLogs.init({
    clientToken,
    env,
    version,
    service,
    site,
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
  datadogRum.setUser(user);
  datadogLogs.setUser(user);
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

export function addAction(name: string, context?: object) {
  datadogRum.addAction(name, context);
}

export function startView(options: {
  name: string;
  context?: Record<string, string>;
}) {
  datadogRum.startView(options);
}
