import type {
  EntityPropertyWithDefinition,
  EntityType as PropertyEntityType,
  SetPropertyValue,
} from '../../generated/properties/types.gen';
import type { FavoriteEntityRef } from '../../generated/storage/types.gen';
import type {
  EventHandler,
  EventMap,
  EventName,
  EventPayload,
} from '../events/types';
import { Lazy, MacroError, unwrap } from '../utils';
import type { MacroClient } from '../utils/client';

/** How the entity-addressed APIs (favorites) identify an entity's type. */
export type MacroEntityType = FavoriteEntityRef['entityType'];

/** An entity that can be added to and removed from the user's favorites. */
export interface Favoritable {
  favorite(): Promise<this>;
  unfavorite(): Promise<this>;
}

/** A favoritable entity that also carries user-defined properties. */
export interface Propertied extends Favoritable {
  properties(opts?: {
    includeMetadata?: boolean;
  }): Promise<EntityPropertyWithDefinition[]>;
  setProperty(propertyId: string, value?: SetPropertyValue): Promise<void>;
  deleteProperty(entityPropertyId: string): Promise<void>;
}

/** `null` folded into `undefined`, so optional API fields read naturally. */
type Normalized<V> = null extends V
  ? NonNullable<V> | undefined
  : undefined extends V
    ? NonNullable<V> | undefined
    : V;

/** Event names under a prefix, e.g. `ScopedEventName<'document'>`. */
type ScopedEventName<P extends string> = Extract<EventName, `${P}.${string}`>;

/** The suffixes of the event names under a prefix, e.g. `'created' | 'updated'`. */
type EventSuffix<
  P extends string,
  N extends EventName = EventName,
> = N extends `${P}.${infer S}` ? S : never;

/**
 * Base for entity handles: a free-to-construct `(client, id)` pair whose
 * detail record loads lazily on first field access and is dropped after any
 * mutation. Subclasses implement {@link fetch} and build their surface from
 * {@link field}, {@link mutate}, and {@link scopedEvents}.
 */
export abstract class MacroEntity<Detail> {
  protected readonly detail: Lazy<Detail>;

  protected constructor(
    protected readonly client: MacroClient,
    public readonly id: string,
    seed?: Detail,
  ) {
    this.detail = new Lazy(() => this.fetch(), seed);
  }

  /** Load the detail record backing {@link field} accessors. */
  protected abstract fetch(): Promise<Detail>;

  /** A lazy accessor for one detail field, `null` normalized to `undefined`. */
  protected field<K extends keyof Detail>(
    key: K,
  ): () => Promise<Normalized<Detail[K]>> {
    return async () =>
      ((await this.detail.get())[key] ?? undefined) as Normalized<Detail[K]>;
  }

  /**
   * Like {@link field}, but maps the raw value through `map` before returning.
   * Used to expose an id field as a handle to the entity it references, e.g.
   * `this.mappedField('owner', (id) => User.byId(this.client, id))`.
   */
  protected mappedField<K extends keyof Detail, T>(
    key: K,
    map: (value: Normalized<Detail[K]>) => T,
  ): () => Promise<T> {
    return async () =>
      map(
        ((await this.detail.get())[key] ?? undefined) as Normalized<Detail[K]>,
      );
  }

  /** Run a write, unwrap it, and drop the cached detail so reads refetch. */
  protected async mutate<TData, TError>(
    fn: (client: MacroClient) => Promise<{
      data?: TData;
      error?: TError;
      response?: Response;
    }>,
  ): Promise<TData> {
    const out = unwrap(await fn(this.client));
    this.detail.clear();
    return out;
  }

  /**
   * Build an `on(event, handler)` method scoped to this entity: subscribes to
   * `<prefix>.<event>` and dispatches only when `scope(metadata)` names this
   * entity's id. Returns an unsubscribe function.
   */
  protected scopedEvents<P extends string>(
    prefix: P,
    scope: (metadata: EventPayload<ScopedEventName<P>>) => unknown,
  ): <E extends EventSuffix<P>>(
    event: E,
    handler: EventHandler<ScopedEventName<P> & `${P}.${E}`>,
  ) => () => void {
    return (event, handler) => {
      const events = this.client.events;
      if (!events)
        throw new MacroError(
          'no webhook receiver configured — pass webhookSecret to MacroClient',
        );
      const full = `${prefix}.${event}` as ScopedEventName<P>;
      return events.on(full, (e: EventMap[ScopedEventName<P>]) => {
        if (scope(e.metadata as EventPayload<ScopedEventName<P>>) !== this.id)
          return;
        return (handler as EventHandler<ScopedEventName<P>>)(e);
      });
    };
  }
}

/** An entity the favorites API can address, and so can be (un)favorited. */
export abstract class FavoritableEntity<Detail>
  extends MacroEntity<Detail>
  implements Favoritable
{
  /** How the entity-addressed APIs (favorites) identify this entity's type. */
  abstract readonly entityType: MacroEntityType;

  /**
   * Add this entity to the user's favorites. Returns this handle for chaining.
   * Plain unwrap: favoriting alters the user's favorites collection, not this
   * entity's own detail, so there's nothing cached to invalidate.
   */
  async favorite(): Promise<this> {
    unwrap(
      await this.client.storage.addFavorite({
        body: { entityId: this.id, entityType: this.entityType },
      }),
    );
    return this;
  }

  /** Remove this entity from the user's favorites. Returns this handle for chaining. */
  async unfavorite(): Promise<this> {
    unwrap(
      await this.client.storage.removeFavoriteByEntity({
        path: {
          entity_type: this.entityType,
          entity_id: this.id,
        },
      }),
    );
    return this;
  }
}

/** A favoritable entity that also carries user-defined properties. */
export abstract class PropertiedEntity<Detail>
  extends FavoritableEntity<Detail>
  implements Propertied
{
  /**
   * This entity's type in the properties service, which names types
   * differently from {@link entityType} (e.g. `THREAD` for `email_thread`).
   */
  protected abstract readonly propertyEntityType: PropertyEntityType;

  /** The properties set on this entity, each with its definition, value, and options. */
  async properties(opts?: {
    includeMetadata?: boolean;
  }): Promise<EntityPropertyWithDefinition[]> {
    const { properties } = unwrap(
      await this.client.properties.getEntityProperties({
        path: {
          entity_type: this.propertyEntityType,
          entity_id: this.id,
        },
        query:
          opts?.includeMetadata !== undefined
            ? { include_metadata: opts.includeMetadata }
            : undefined,
      }),
    );
    return properties;
  }

  /**
   * Set a property value on this entity by property definition id, or attach
   * the property without a value when `value` is omitted.
   */
  async setProperty(
    propertyId: string,
    value?: SetPropertyValue,
  ): Promise<void> {
    unwrap(
      await this.client.properties.setEntityProperty({
        path: {
          entity_type: this.propertyEntityType,
          entity_id: this.id,
          property_id: propertyId,
        },
        body: { value: value ?? null },
      }),
    );
  }

  /**
   * Remove a property from this entity by its entity-property assignment id
   * (the `property.id` of a {@link properties} entry).
   */
  async deleteProperty(entityPropertyId: string): Promise<void> {
    unwrap(
      await this.client.properties.deleteEntityProperty({
        path: { entity_property_id: entityPropertyId },
      }),
    );
  }
}
