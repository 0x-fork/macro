import { globalSplitManager } from '@app/signal/splitLayout';
import { fileTypeToBlockName } from '@core/constant/allBlocks';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { getHotkeyCommand, runCommand } from '@core/hotkey/utils';
import { waitForFrames } from '@core/util/sleep';
import {
  type EntityData,
  isSearchEntity,
  type SearchLocation,
  type WithSearch,
} from '@macro-entity';
import type { Accessor } from 'solid-js';
import { onCleanup } from 'solid-js';

const mergeSearchEntities = <T extends EntityData>(
  first: WithSearch<T>,
  second: WithSearch<T>
): WithSearch<T> => {
  const serviceEntity = first.search.source === 'service' ? first : second;
  const localEntity = first.search.source === 'local' ? first : second;
  const hasLocal =
    first.search.source === 'local' || second.search.source === 'local';

  // NOTE: we that the longer name highlight is more relevant since it will contain a macro highlight tag
  let nameHighlight;
  if (serviceEntity.search.nameHighlight && localEntity.search.nameHighlight) {
    nameHighlight =
      serviceEntity.search.nameHighlight.length >=
      localEntity.search.nameHighlight.length
        ? serviceEntity.search.nameHighlight
        : localEntity.search.nameHighlight;
  } else {
    nameHighlight =
      serviceEntity.search.nameHighlight || localEntity.search.nameHighlight;
  }

  return {
    ...serviceEntity,
    search: {
      ...serviceEntity.search,
      source: hasLocal ? 'local' : 'service',
      nameHighlight,
      contentHitData: serviceEntity.search.contentHitData?.length
        ? serviceEntity.search.contentHitData
        : localEntity.search.contentHitData,
    },
  };
};

/**
 * Deduplicates entities by id, preferring entities with search data from 'service' source
 * over 'local' source, and using latest timestamp as a tiebreaker.
 * When preferring service results, merges local nameHighlight if service doesn't have one.
 */
export const deduplicateEntities = <T extends EntityData>(
  entities: T[]
): T[] => {
  const entityMap = new Map<string, T>();

  for (const entity of entities) {
    const existing = entityMap.get(entity.id);

    if (!existing) {
      entityMap.set(entity.id, entity);
      continue;
    }

    const existingHasSearch = isSearchEntity(existing);
    const newHasSearch = isSearchEntity(entity);

    // Prefer entities with search data
    if (newHasSearch && !existingHasSearch) {
      entityMap.set(entity.id, entity);
      continue;
    }

    // If both have search data, prefer 'service' over 'local'
    if (existingHasSearch && newHasSearch) {
      const existingSource = existing.search.source;
      const newSource = entity.search.source;

      if (
        (newSource === 'service' && existingSource === 'local') ||
        (existingSource === 'service' && newSource === 'local')
      ) {
        // Merge service and local search data
        entityMap.set(entity.id, mergeSearchEntities(entity, existing));
        continue;
      }

      // If both are the same source, keep the one with latest timestamp
      if (isNewerEntity(entity, existing)) {
        entityMap.set(entity.id, entity);
      }
      continue;
    }

    // If neither has search, keep the one with latest timestamp
    if (!existingHasSearch && !newHasSearch) {
      if (isNewerEntity(entity, existing)) {
        entityMap.set(entity.id, entity);
      }
    }
    // Otherwise keep existing (it has search and new doesn't)
  }

  return Array.from(entityMap.values());
};

/**
 * Gets the timestamp of an entity (updatedAt or createdAt)
 */
const getEntityTimestamp = (entity: EntityData): number => {
  return entity.updatedAt ?? entity.createdAt ?? 0;
};

/**
 * Returns true if the new entity should replace the existing one based on timestamp. If the timestamp is the same, prefer to use the newer entity to handle optimistic updates
 */
export const isNewerEntity = (
  newEntity: EntityData,
  existing: EntityData
): boolean => {
  return getEntityTimestamp(newEntity) >= getEntityTimestamp(existing);
};

export const openEntityInNewTab = ({
  entity,
  location,
}: {
  entity: EntityData;
  location?: SearchLocation;
}) => {
  // Build URL for the entity
  let entityPath: string;
  if (entity.type === 'document') {
    const { fileType, subType } = entity;
    const blockName = fileTypeToBlockName(subType?.type ?? fileType);
    entityPath = `/app/${blockName}/${entity.id}`;
  } else {
    entityPath = `/app/${entity.type}/${entity.id}`;
  }

  // Add location params if present
  const entityUrl = new URL(entityPath, window.location.origin);
  if (location) {
    switch (location.type) {
      case 'channel':
        if (location.messageId) {
          entityUrl.searchParams.set('channel_message_id', location.messageId);
        }
        if (location.threadId) {
          entityUrl.searchParams.set('thread', location.threadId);
        }
        break;
      case 'email':
        if (location.messageId) {
          entityUrl.searchParams.set('email_message_id', location.messageId);
        }

        break;
      case 'md':
        if (location.nodeId) {
          entityUrl.searchParams.set('node_id', location.nodeId);
        }
        break;
      case 'pdf':
        if (location.searchPage !== undefined) {
          entityUrl.searchParams.set(
            'search_page',
            location.searchPage.toString()
          );
        }
        if (location.searchRawQuery) {
          entityUrl.searchParams.set(
            'search_raw_query',
            location.searchRawQuery
          );
        }
        if (location.highlightTerms) {
          entityUrl.searchParams.set(
            'search_highlight_terms',
            JSON.stringify(location.highlightTerms)
          );
        }
        if (location.searchSnippet) {
          entityUrl.searchParams.set('search_snippet', location.searchSnippet);
        }
        break;
    }
  }

  window.open(entityUrl.toString(), '_blank', 'noopener');
};

/**
 * Reference to a soup view for global hotkey forwarding
 */
type SoupViewRef = {
  domRef: Accessor<HTMLElement | undefined>;
  soup: SoupState;
};

/**
 * Map to track soup view references by split ID for global hotkey forwarding.
 * Used by registerEntityHotkey to forward global hotkeys to the active split.
 */
export const splitIdToSoupViewRef = new Map<string, SoupViewRef>();

let globalKeyboardEvent: KeyboardEvent | undefined;

type ExecuteKeyDownHandlerCallback = (props: {
  keyboardEvent?: KeyboardEvent;
}) => boolean;

/**
 * Registers entity hotkeys to global scope and split panel scope.
 * When global hotkey is fired, runs hotkey command from active split panel scope.
 */
export function registerEntityHotkey(
  opts: Omit<Parameters<typeof registerHotkey>[0], 'condition'> & {
    canExecuteKeyDownHandler?: ExecuteKeyDownHandlerCallback;
    globalCommandScope?: string;
  }
): {
  registerHotkeyReturn: {
    commandScopeId: string;
  };
  globalRegisterHotkeyReturn: {
    commandScopeId: string;
  };
} {
  onCleanup(() => {
    globalKeyboardEvent = undefined;
  });

  // scoped hotkey
  const registerHotkeyReturn = registerHotkey({
    ...opts,
    keyDownHandler: (e) => {
      const canExecuteKeyDownHandler = () => {
        if (!opts.canExecuteKeyDownHandler) return true;
        return opts.canExecuteKeyDownHandler({
          keyboardEvent: e ?? globalKeyboardEvent,
        });
      };

      if (canExecuteKeyDownHandler()) {
        return opts.keyDownHandler(e);
      }

      return false;
    },
    condition: undefined,
  });

  // global hotkey to run active split scope command
  const globalRegisterHotkeyReturn = registerHotkey({
    ...opts,
    scopeId: opts.globalCommandScope ? opts.globalCommandScope : 'global',
    hotkeyToken: undefined,
    tags: undefined,
    condition: undefined,
    registrationType: undefined,
    handlerPriority: undefined,
    keyDownHandler: (event) => {
      globalKeyboardEvent = event;
      queueMicrotask(() => {
        globalKeyboardEvent = undefined;
      });

      if (event) {
        const target = event.target as HTMLElement;
        if (
          target.closest(
            `
            [role="dialog"],
            [role="alertdialog"],
            [data-modal="true"],
            .z-modal,
            .z-modal-overlay
            `
          )
        ) {
          return false;
        }
      }

      const currentActiveSplitId = globalSplitManager()?.activeSplitId();

      const getCommand = () => {
        const soupViewRef = splitIdToSoupViewRef.get(currentActiveSplitId!);
        const splitScope = soupViewRef?.domRef();
        if (!splitScope || !(splitScope instanceof HTMLElement)) return;
        const scopeId = splitScope.dataset.hotkeyScope;
        if (!scopeId || !opts.hotkey) return undefined;

        return getHotkeyCommand(
          scopeId,
          // @ts-expect-error hotkey type mismatch
          opts.hotkey[0]
        );
      };
      const command = getCommand();
      if (!command) return false;

      runCommand(command);
      return false;
    },
  });

  return {
    registerHotkeyReturn,
    globalRegisterHotkeyReturn,
  } as {
    registerHotkeyReturn: { commandScopeId: string };
    globalRegisterHotkeyReturn: { commandScopeId: string };
  };
}

/**
 * Restores DOM focus to an entity row in the soup view after a modal action completes.
 * This is necessary because the hotkey system is focus-based, and modals steal
 * focus away from the soup view. Without restoring DOM focus, scoped hotkeys
 * like 'escape' won't work.
 *
 * @param entityId - Optional entity ID to focus on. If not provided, focuses the first entity in the list.
 */
export const restoreSoupFocus = async (entityId?: string): Promise<void> => {
  // Get the active split's soup view DOM reference
  const activeSplitId = globalSplitManager()?.activeSplitId();
  if (!activeSplitId) return;

  const soupViewRef = splitIdToSoupViewRef.get(activeSplitId);
  const domRef = soupViewRef?.domRef();

  if (!domRef) return;

  // Wait for DOM to update after modal closes
  await waitForFrames(2);

  // Find and focus the entity element
  if (entityId) {
    const entityEl = domRef.querySelector(`[data-entity-id="${entityId}"]`);
    if (entityEl instanceof HTMLElement) {
      entityEl.focus();
      return;
    }
  }

  // Fallback: focus the first entity in the list if no specific entity to focus
  const firstEntityEl = domRef.querySelector('[data-entity-id]');
  if (firstEntityEl instanceof HTMLElement) {
    firstEntityEl.focus();
  }
};
