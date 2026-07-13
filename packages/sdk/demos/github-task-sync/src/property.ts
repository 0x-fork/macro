import type { MacroClient } from '@macro/sdk';

const PROPERTY_NAME = 'GitHub Issue';

/**
 * Id of the "GitHub Issue" link property that marks a task as synced from
 * GitHub, creating the definition on first boot.
 */
export async function ensureGithubIssueProperty(
  sdk: MacroClient,
): Promise<string> {
  const { data } = await sdk.properties.listProperties({
    query: { scope: 'user' },
  });
  for (const def of data ?? []) {
    const flat = 'id' in def ? def : def.definition;
    if (flat.display_name === PROPERTY_NAME) return flat.id;
  }
  const { data: created } = await sdk.properties.createPropertyDefinition({
    body: {
      display_name: PROPERTY_NAME,
      scope: 'user',
      data_type: { type: 'link', multi: false },
    },
  });
  if (!created) throw new Error('Failed to create property definition');
  console.log(`created "${PROPERTY_NAME}" property ${created.id}`);
  return created.id;
}
