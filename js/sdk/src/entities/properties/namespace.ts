import type {
  PropertyDefinitionResponse,
  EntityType as PropertyEntityType,
  PropertyOption,
  PropertyScope,
  TagSetResponse,
} from '../../../generated/properties/types.gen';
import { unwrap } from '../../utils';
import type { MacroClient } from '../../utils/client';

export type {
  PropertyDefinitionResponse,
  PropertyEntityType,
  PropertyOption,
  PropertyScope,
  TagSetResponse,
};

/**
 * Property definitions and tag sets. Entity-level reads and writes live on
 * the entity handles ({@link PropertiedEntity.properties}, `setProperty`,
 * `deleteProperty`).
 */
export class PropertiesNamespace {
  constructor(private readonly client: MacroClient) {}

  /** Property definitions visible to the user, filtered by scope (default all). */
  async definitions(opts?: {
    scope?: PropertyScope;
    includeOptions?: boolean;
    forEntityType?: PropertyEntityType;
  }): Promise<PropertyDefinitionResponse[]> {
    return unwrap(
      await this.client.properties.listProperties({
        query: {
          scope: opts?.scope ?? 'all',
          ...(opts?.includeOptions !== undefined
            ? { include_options: opts.includeOptions }
            : {}),
          ...(opts?.forEntityType !== undefined
            ? { for_entity_type: opts.forEntityType }
            : {}),
        },
      }),
    );
  }

  /** The selectable options of a property definition (for dropdowns). */
  async options(definitionId: string): Promise<PropertyOption[]> {
    return unwrap(
      await this.client.properties.getPropertyOptions({
        path: { definition_id: definitionId },
      }),
    );
  }

  /** The user's tag sets: their personal set, plus their team's when on a team. */
  async tags(): Promise<TagSetResponse[]> {
    return unwrap(await this.client.properties.listTags({}));
  }
}
