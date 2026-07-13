export type Env = 'dev' | 'prod' | 'local';

export type ServiceName =
  | 'storage'
  | 'auth'
  | 'email'
  | 'cognition'
  | 'notification'
  | 'properties'
  | 'search'
  | 'connection'
  | 'contacts'
  | 'unfurl';

export const HOSTS: Record<Env, Record<ServiceName, string>> = {
  dev: {
    storage: 'https://cloud-storage-dev.macro.com',
    auth: 'https://auth-service-dev.macro.com',
    email: 'https://email-service-dev.macro.com',
    cognition: 'https://document-cognition-dev.macro.com',
    notification: 'https://notifications-dev.macro.com',
    properties: 'https://cloud-storage-dev.macro.com',
    search: 'https://cloud-storage-dev.macro.com',
    connection: 'https://connection-gateway-dev.macro.com',
    contacts: 'https://contacts-dev.macro.com',
    unfurl: 'https://unfurl-service-dev.macro.com',
  },
  prod: {
    storage: 'https://cloud-storage.macro.com',
    auth: 'https://auth-service.macro.com',
    email: 'https://email-service.macro.com',
    cognition: 'https://document-cognition.macro.com',
    notification: 'https://notifications.macro.com',
    properties: 'https://cloud-storage.macro.com',
    search: 'https://cloud-storage.macro.com',
    connection: 'https://connection-gateway.macro.com',
    contacts: 'https://contacts.macro.com',
    unfurl: 'https://unfurl-service.macro.com',
  },
  local: {
    storage: 'http://localhost:8086',
    auth: 'http://localhost:8080',
    email: 'http://localhost:8087',
    cognition: 'http://localhost:8085',
    notification: 'http://localhost:8089',
    properties: 'http://localhost:8086',
    search: 'http://localhost:8086',
    connection: 'http://localhost:8082',
    contacts: 'http://localhost:8083',
    unfurl: 'http://localhost:8095',
  },
};

export type TokenSource = string | (() => string | Promise<string>);

export interface MacroOpts {
  /** API token. Falls back to MACRO_API_KEY then MACRO_TOKEN env vars. */
  token?: TokenSource;
  env?: Env;
  /** Override individual service hosts. */
  hosts?: Partial<Record<ServiceName, string>>;
  /** Signing secret for verifying incoming webhooks. */
  webhookSecret?: string;
}
