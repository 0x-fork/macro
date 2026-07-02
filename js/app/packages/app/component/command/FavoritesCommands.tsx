import {
  favoriteDisplayName,
  favoriteIconType,
  favoriteSplitContent,
} from '@app/util/favorites';
import { EntityIcon } from '@core/component/EntityIcon';
import type { ValidHotkey } from '@core/hotkey/types';
import { registerScope } from '@core/hotkey/utils';
import Star from '@phosphor/star.svg';
import { useFavoritesQuery } from '@queries/favorites/favorites';
import type { Favorite } from '@service-storage/generated/schemas/favorite';
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

/** Digit shortcuts for the first nine favorites in each scope. */
const DIGIT_HOTKEYS: ValidHotkey[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
];

/**
 * Registers the "Your favorites" / "Team favorites" command-menu commands and
 * keeps the per-favorite commands in their sub-view scopes in sync with the
 * favorites data. Renders nothing.
 */
export function FavoritesCommands() {
  const favorites = useFavoritesQuery();
  const { openWithSplit } = useSplitLayout();

  const openFavorite = (favorite: Favorite) => {
    openWithSplit(favoriteSplitContent(favorite), {
      referredFrom: 'kommand-menu',
    });
    // Digit hotkeys run through the hotkey engine rather than the menu's
    // selection path, so the menu must be closed here.
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
      condition: () => (favorites.data?.user.length ?? 0) > 0,
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
      condition: () => (favorites.data?.team?.length ?? 0) > 0,
      keyDownHandler: () => true,
      activateCommandScopeId: TEAM_FAVORITES_COMMAND_SCOPE,
      keywords: FAVORITES_KEYWORDS,
      icon: Star,
    })
  );

  const registerFavorites = (list: Favorite[], scopeId: string) => {
    list.forEach((favorite, index) => {
      dynamicGroup.add(
        registerHotkey({
          scopeId,
          hotkey: DIGIT_HOTKEYS[index],
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
          runWithInputFocused: true,
        })
      );
    });
  };

  // Hotkey registrations are non-reactive, so sync them with the favorites
  // data: dispose and re-register the per-favorite commands on every change.
  createEffect(() => {
    const data = favorites.data;
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
