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
    // Ignore re-triggers while a toggle is still settling so a rapid
    // double-press can't fire an add and its own remove against each other.
    if (addMutation.isPending || removeMutation.isPending) return;

    const shouldRemove = favoritable.every((entity) =>
      isFavorited(entity, scope)
    );
    const label = scope === 'team' ? 'team favorites' : 'favorites';
    const verb = shouldRemove ? 'Removed' : 'Added';
    const preposition = shouldRemove ? 'from' : 'to';

    // On add, skip entities already favorited so counts reflect real work.
    const targets = shouldRemove
      ? favoritable
      : favoritable.filter((entity) => !isFavorited(entity, scope));
    if (targets.length === 0) return;

    const results = await Promise.allSettled(
      targets.map((entity) => {
        const entityType = favoriteEntityType(entity.type)!;
        const args = { entityType, entityId: entity.id, scope };
        return shouldRemove
          ? removeMutation.mutateAsync(args)
          : addMutation.mutateAsync(args);
      })
    );

    // Each mutation rolls its own optimistic change back on failure, so report
    // what actually happened rather than an all-or-nothing result.
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    if (failed === 0) {
      toast.success(
        succeeded > 1
          ? `${verb} ${succeeded} items ${preposition} ${label}`
          : `${verb} ${preposition} ${label}`
      );
    } else if (succeeded === 0) {
      toast.failure('Failed to update favorites');
    } else {
      toast.failure(
        `${verb} ${succeeded} of ${results.length} items ${preposition} ${label}; ${failed} failed`
      );
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
