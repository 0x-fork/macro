import { Sdk as AuthSdk } from '../../generated/auth/sdk.gen';
import { Sdk as CognitionSdk } from '../../generated/cognition/sdk.gen';
import { Sdk as ContactsSdk } from '../../generated/contacts/sdk.gen';
import { Sdk as EmailSdk } from '../../generated/email/sdk.gen';
import { Sdk as NotificationSdk } from '../../generated/notification/sdk.gen';
import { Sdk as PropertiesSdk } from '../../generated/properties/sdk.gen';
import { Sdk as SearchSdk } from '../../generated/search/sdk.gen';
import { createClient } from '../../generated/storage/client';
import { Sdk as StorageSdk } from '../../generated/storage/sdk.gen';
import { type Env, HOSTS, type MacroOpts, type ServiceName } from '../config';
import { MacroEvents } from '../events/receiver';

export class MacroClient {
  readonly auth: AuthSdk;
  readonly cognition: CognitionSdk;
  readonly contacts: ContactsSdk;
  readonly email: EmailSdk;
  readonly notification: NotificationSdk;
  readonly properties: PropertiesSdk;
  readonly search: SearchSdk;
  readonly storage: StorageSdk;
  readonly wsVerify?: string;
  readonly events?: MacroEvents;
  private readonly token: string | (() => string | Promise<string>);

  constructor(opts: MacroOpts) {
    const env: Env = opts.env ?? 'dev';
    const hosts = { ...HOSTS[env], ...opts.hosts };
    this.token = opts.token;
    this.wsVerify = opts.wsVerify;

    this.auth = new AuthSdk({ client: this.makeClient(hosts.auth) });
    this.cognition = new CognitionSdk({
      client: this.makeClient(hosts.cognition),
    });
    this.contacts = new ContactsSdk({
      client: this.makeClient(hosts.contacts),
    });
    this.email = new EmailSdk({ client: this.makeClient(hosts.email) });
    this.notification = new NotificationSdk({
      client: this.makeClient(hosts.notification),
    });
    this.properties = new PropertiesSdk({
      client: this.makeClient(hosts.properties),
    });
    this.search = new SearchSdk({ client: this.makeClient(hosts.search) });
    this.storage = new StorageSdk({ client: this.makeClient(hosts.storage) });

    if (opts.webhookSecret) {
      this.events = new MacroEvents(this, opts.webhookSecret);
    }
  }

  private makeClient(baseUrl: string) {
    const c = createClient({ baseUrl });
    c.interceptors.request.use(async (request) => {
      const tok =
        typeof this.token === 'function' ? await this.token() : this.token;
      request.headers.set('Authorization', `Bearer ${tok}`);
      return request;
    });
    return c;
  }
}

export type { ServiceName };
