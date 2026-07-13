import { Sdk as AuthSdk } from '../generated/auth/sdk.gen';
import { Sdk as CognitionSdk } from '../generated/cognition/sdk.gen';
import { Sdk as ContactsSdk } from '../generated/contacts/sdk.gen';
import { Sdk as EmailSdk } from '../generated/email/sdk.gen';
import { Sdk as NotificationSdk } from '../generated/notification/sdk.gen';
import { Sdk as PropertiesSdk } from '../generated/properties/sdk.gen';
import { Sdk as SearchSdk } from '../generated/search/sdk.gen';
import { createClient } from '../generated/storage/client';
import { Sdk as StorageSdk } from '../generated/storage/sdk.gen';
import { MacroEvents } from './events';
import { HOSTS, type MacroOpts } from './config';

export class MacroClient {
  readonly auth: AuthSdk;
  readonly cognition: CognitionSdk;
  readonly contacts: ContactsSdk;
  readonly email: EmailSdk;
  readonly notification: NotificationSdk;
  readonly properties: PropertiesSdk;
  readonly search: SearchSdk;
  readonly storage: StorageSdk;
  readonly events?: MacroEvents;

  constructor(opts: MacroOpts) {
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
          'no Macro API token — set MACRO_API_KEY or pass token to new MacroClient()',
        );
      });

    this.auth = new AuthSdk({ client: this.makeClient(hosts.auth, token) });
    this.cognition = new CognitionSdk({
      client: this.makeClient(hosts.cognition, token),
    });
    this.contacts = new ContactsSdk({
      client: this.makeClient(hosts.contacts, token),
    });
    this.email = new EmailSdk({ client: this.makeClient(hosts.email, token) });
    this.notification = new NotificationSdk({
      client: this.makeClient(hosts.notification, token),
    });
    this.properties = new PropertiesSdk({
      client: this.makeClient(hosts.properties, token),
    });
    this.search = new SearchSdk({
      client: this.makeClient(hosts.search, token),
    });
    this.storage = new StorageSdk({
      client: this.makeClient(hosts.storage, token),
    });

    if (opts.webhookSecret) {
      this.events = new MacroEvents(opts.webhookSecret);
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
