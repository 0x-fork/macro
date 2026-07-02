import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import {
  favoriteEntityType,
  useAddFavoriteMutation,
  useFavoritesQuery,
  useRemoveFavoriteMutation,
} from '@queries/favorites/favorites';
import type { FavoriteScope } from '@service-storage/generated/schemas/favoriteScope';
import type { SoupState } from '../create-soup-state';

/**
 * Toggle an entity in the user's (or their team's) favorites.
 *
 * `execute` favorites every entity that is not yet favorited in the given
 * scope; when all of them already are, it unfavorites them instead.
 */
export const makeFavoriteAction = () => {
  const favoritesQuery = useFavoritesQuery();
  const addMutation = useAddFavoriteMutation();
  const removeMutation = useRemoveFavoriteMutation();

  const canExecute = (entity: EntityData): boolean =>
    favoriteEntityType(entity.type) !== undefined;

  /** Whether the user belongs to a team (team favorites are available). */
  const hasTeam = (): boolean => favoritesQuery.data?.team !== undefined;

  const isFavorited = (
    entity: EntityData,
    scope: FavoriteScope = 'user'
  ): boolean => {
    const type = favoriteEntityType(entity.type);
    if (!type) return false;
    const data = favoritesQuery.data;
    if (!data) return false;
    const list = scope === 'user' ? data.user : (data.team ?? []);
    return list.some(
      (favorite) =>
        favorite.entityType === type && favorite.entityId === entity.id
    );
  };

  const execute = async (
    entities: EntityData[],
    scope: FavoriteScope = 'user'
  ) => {
    const favoritable = entities.filter(canExecute);
    if (favoritable.length === 0) return;

    const shouldRemove = favoritable.every((entity) =>
      isFavorited(entity, scope)
    );
    const label = scope === 'team' ? 'team favorites' : 'favorites';

    try {
      if (shouldRemove) {
        await Promise.all(
          favoritable.map((entity) =>
            removeMutation.mutateAsync({
              entityType: favoriteEntityType(entity.type)!,
              entityId: entity.id,
              scope,
            })
          )
        );
        toast.success(
          favoritable.length > 1
            ? `Removed ${favoritable.length} items from ${label}`
            : `Removed from ${label}`
        );
      } else {
        await Promise.all(
          favoritable
            .filter((entity) => !isFavorited(entity, scope))
            .map((entity) =>
              addMutation.mutateAsync({
                entityType: favoriteEntityType(entity.type)!,
                entityId: entity.id,
                scope,
              })
            )
        );
        toast.success(
          favoritable.length > 1
            ? `Added ${favoritable.length} items to ${label}`
            : `Added to ${label}`
        );
      }
    } catch (error) {
      console.error('Failed to update favorites', error);
      toast.failure('Failed to update favorites');
    }
  };

  const executeWithSoup = async (
    entities: EntityData[],
    _soup: SoupState,
    scope: FavoriteScope = 'user'
  ) => {
    // Favoriting doesn't change the list contents; keep selection/focus.
    await execute(entities, scope);
  };

  return { canExecute, isFavorited, hasTeam, execute, executeWithSoup };
};
