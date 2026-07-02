import {
  favoriteDisplayName,
  favoriteIconType,
  favoriteSplitContent,
} from '@app/util/favorites';
import { EntityIcon } from '@core/component/EntityIcon';
import { registerScope } from '@core/hotkey/utils';
import Star from '@phosphor/star.svg';
import { queryClient } from '@queries/client';
import { useFavoritesQuery } from '@queries/favorites/favorites';
import { favoriteKeys } from '@queries/favorites/keys';
import type { Favorite } from '@service-storage/generated/schemas/favorite';
import type { FavoritesList } from '@service-storage/generated/schemas/favoritesList';
import { createHotkeyGroup, registerHotkey } from 'core/hotkey/hotkeys';
import { createEffect, onCleanup } from 'solid-js';
import { useSplitLayout } from '../split-layout/layout';
import { CommandState } from './state';

/** Command scopes for the favorites sub-views of the command menu. */
export const USER_FAVORITES_COMMAND_SCOPE = 'command-scope-user-favorites';
export const TEAM_FAVORITES_COMMAND_SCOPE = 'command-scope-team-favorites';

registerScope({
  parentScopeId: 'global',
  scopeId: USER_FAVORITES_COMMAND_SCOPE,
  type: 'command',
});

registerScope({
  parentScopeId: 'global',
  scopeId: TEAM_FAVORITES_COMMAND_SCOPE,
  type: 'command',
});

const FAVORITES_KEYWORDS = ['favorites', 'favorite', 'starred', 'pinned'];

/**
 * Registers the "Your favorites" / "Team favorites" command-menu commands and
 * keeps the per-favorite commands in their sub-view scopes in sync with the
 * favorites data. Renders nothing.
 */
export function FavoritesCommands() {
  const favorites = useFavoritesQuery();
  const { openWithSplit } = useSplitLayout();

  // The command menu evaluates command `condition()`s (and mounts) under a
  // Suspense boundary. Reading `favorites.data` off the solid-query proxy while
  // the query is pending suspends that boundary, blanking the menu and killing
  // its keyboard navigation until the request settles. Read the cache
  // imperatively instead, using `dataUpdatedAt` only as a non-suspending
  // reactive trigger so registrations still refresh when favorites change.
  const favoritesData = (): FavoritesList | undefined => {
    void favorites.dataUpdatedAt;
    return queryClient.getQueryData<FavoritesList>(favoriteKeys.list.queryKey);
  };

  const openFavorite = (favorite: Favorite) => {
    openWithSplit(favoriteSplitContent(favorite), {
      referredFrom: 'kommand-menu',
    });
    // Close the menu and clear the query once a favorite is opened.
    CommandState.close();
    CommandState.setQuery('');
  };

  const staticGroup = createHotkeyGroup();
  const dynamicGroup = createHotkeyGroup();

  staticGroup.addDisposer(
    CommandState.registerCommandScopePlaceholder(
      USER_FAVORITES_COMMAND_SCOPE,
      'Open favorite...'
    )
  );
  staticGroup.addDisposer(
    CommandState.registerCommandScopePlaceholder(
      TEAM_FAVORITES_COMMAND_SCOPE,
      'Open favorite...'
    )
  );

  staticGroup.add(
    registerHotkey({
      scopeId: 'global',
      description: 'Your favorites',
      // An empty sub-view is a dead end, so hide the command until the user
      // has favorites.
      condition: () => (favoritesData()?.user.length ?? 0) > 0,
      keyDownHandler: () => true,
      activateCommandScopeId: USER_FAVORITES_COMMAND_SCOPE,
      keywords: FAVORITES_KEYWORDS,
      icon: Star,
    })
  );

  staticGroup.add(
    registerHotkey({
      scopeId: 'global',
      description: 'Team favorites',
      // `team` is undefined when the user does not belong to a team.
      condition: () => (favoritesData()?.team?.length ?? 0) > 0,
      keyDownHandler: () => true,
      activateCommandScopeId: TEAM_FAVORITES_COMMAND_SCOPE,
      keywords: FAVORITES_KEYWORDS,
      icon: Star,
    })
  );

  const registerFavorites = (list: Favorite[], scopeId: string) => {
    // Registered without a hotkey: bare digits would fight type-to-filter in
    // the sub-view's search input. The entries are still listed and openable
    // via arrow/enter or click (the handler runs with `e` undefined).
    list.forEach((favorite) => {
      dynamicGroup.add(
        registerHotkey({
          scopeId,
          description: favoriteDisplayName(favorite),
          keyDownHandler: () => {
            openFavorite(favorite);
            return true;
          },
          commandPaletteIcon: (props) => (
            <EntityIcon
              targetType={favoriteIconType(favorite)}
              class={props.class}
            />
          ),
        })
      );
    });
  };

  // Hotkey registrations are non-reactive, so sync them with the favorites
  // data: dispose and re-register the per-favorite commands on every change.
  createEffect(() => {
    const data = favoritesData();
    dynamicGroup.dispose();
    if (!data) return;
    registerFavorites(data.user, USER_FAVORITES_COMMAND_SCOPE);
    registerFavorites(data.team ?? [], TEAM_FAVORITES_COMMAND_SCOPE);
  });

  onCleanup(() => {
    dynamicGroup.dispose();
    staticGroup.dispose();
  });

  return null;
}
