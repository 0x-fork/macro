import { createClient } from '../generated/storage/client';
import { HOSTS, type MacroOpts } from './config';
import { MacroEvents } from './events';
import { AuthClient } from './services/auth';
import { CognitionClient } from './services/cognition';
import { ContactsClient } from './services/contacts';
import { EmailClient } from './services/email';
import { NotificationClient } from './services/notification';
import { PropertiesClient } from './services/properties';
import { SearchClient } from './services/search';
import { StorageClient } from './services/storage';

export class MacroClient<T extends MacroOpts = MacroOpts> {
  readonly auth: AuthClient;
  readonly cognition: CognitionClient;
  readonly contacts: ContactsClient;
  readonly email: EmailClient;
  readonly notification: NotificationClient;
  readonly properties: PropertiesClient;
  readonly search: SearchClient;
  readonly storage: StorageClient;
  declare readonly events: T extends { webhookSecret: string }
    ? MacroEvents
    : undefined;

  constructor(opts: T) {
    const env = opts.env ?? 'dev';
    const hosts = { ...HOSTS[env], ...opts.hosts };
    const envToken =
      typeof process !== 'undefined'
        ? (process.env.MACRO_API_KEY ?? process.env.MACRO_TOKEN)
        : undefined;
    const token =
      opts.token ??
      envToken ??
      (() => {
        throw new Error(
          'no Macro API token -- set MACRO_API_KEY or pass token to new MacroClient()',
        );
      });

    this.auth = new AuthClient({ client: this.makeClient(hosts.auth, token) });
    this.cognition = new CognitionClient({
      client: this.makeClient(hosts.cognition, token),
    });
    this.contacts = new ContactsClient({
      client: this.makeClient(hosts.contacts, token),
    });
    this.email = new EmailClient({
      client: this.makeClient(hosts.email, token),
    });
    this.notification = new NotificationClient({
      client: this.makeClient(hosts.notification, token),
    });
    this.properties = new PropertiesClient({
      client: this.makeClient(hosts.properties, token),
    });
    this.search = new SearchClient({
      client: this.makeClient(hosts.search, token),
    });
    this.storage = new StorageClient({
      client: this.makeClient(hosts.storage, token),
    });

    if (opts.webhookSecret) {
      (this as { events?: MacroEvents }).events = new MacroEvents(opts.webhookSecret);
    }
  }

  private makeClient(
    baseUrl: string,
    token: string | (() => string | Promise<string>),
  ) {
    const c = createClient({ baseUrl });
    c.interceptors.request.use(async (request) => {
      const tok = typeof token === 'function' ? await token() : token;
      request.headers.set('Authorization', `Bearer ${tok}`);
      return request;
    });
    return c;
  }
}
