import type { Macro } from '@macro/sdk';

const PROPERTY_NAME = 'GitHub Issue';

/**
 * Id of the "GitHub Issue" link property that marks a task as synced from
 * GitHub, creating the definition on first boot.
 */
export async function ensureGithubIssueProperty(macro: Macro): Promise<string> {
  for (const definition of await macro.properties.list()) {
    if ((await definition.displayName) === PROPERTY_NAME) return definition.id;
  }
  const created = await macro.properties.create({
    displayName: PROPERTY_NAME,
    scope: 'user',
    dataType: { type: 'link', multi: false },
  });
  console.log(`created "${PROPERTY_NAME}" property ${created.id}`);
  return created.id;
}
