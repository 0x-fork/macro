import { throwOnErr } from '@core/util/result';
import type { EntityData } from '@entity';
import { storageServiceClient } from '@service-storage/client';
import type { AddFavoriteRequest } from '@service-storage/generated/schemas/addFavoriteRequest';
import type { Favorite } from '@service-storage/generated/schemas/favorite';
import type { FavoriteScope } from '@service-storage/generated/schemas/favoriteScope';
import type { FavoritesList } from '@service-storage/generated/schemas/favoritesList';
import { useMutation, useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';

import { queryClient } from '../client';
import { type MutationCallbacks, withCallbacks } from '../utils';

import { favoriteKeys } from './keys';

export type FavoriteEntityType = AddFavoriteRequest['entityType'];

/**
 * Maps a frontend entity to the backend favorites entity type, or undefined
 * for entity kinds that cannot be favorited.
 */
export function favoriteEntityType(
  type: EntityData['type']
): FavoriteEntityType | undefined {
  switch (type) {
    case 'document':
      return 'document';
    case 'chat':
      return 'chat';
    case 'project':
      return 'project';
    case 'email':
      return 'email_thread';
    case 'channel':
      return 'channel';
    case 'channel_message':
    case 'channel_thread':
      return 'channel_message';
    case 'call':
      return 'call';
    case 'crm_company':
      return 'crm_company';
    case 'crm_contact':
      return 'crm_contact';
    default:
      return undefined;
  }
}

export function favoriteEntityKey(
  entityType: FavoriteEntityType,
  entityId: string
): string {
  return `${entityType}:${entityId}`;
}

/** The user's favorites plus their team's favorites (if they have a team). */
export function useFavoritesQuery() {
  return useQuery(() => ({
    queryKey: favoriteKeys.list.queryKey,
    queryFn: async () =>
      await throwOnErr(() => storageServiceClient.favorites.getFavorites()),
    staleTime: 60_000,
  }));
}

function readList(): FavoritesList | undefined {
  return queryClient.getQueryData<FavoritesList>(favoriteKeys.list.queryKey);
}

function writeList(update: (prev: FavoritesList) => FavoritesList) {
  queryClient.setQueryData<FavoritesList>(favoriteKeys.list.queryKey, (prev) =>
    prev ? update(prev) : prev
  );
}

export function invalidateFavorites() {
  return queryClient.invalidateQueries({
    queryKey: favoriteKeys.list.queryKey,
  });
}

/**
 * Reactive lookup of the favorite records for an entity in each scope.
 * Both are undefined when the entity is not favorited (or favorites have
 * not loaded yet).
 */
export function useFavoriteForEntity(
  entityType: Accessor<FavoriteEntityType | undefined>,
  entityId: Accessor<string | undefined>
): Accessor<{ user?: Favorite; team?: Favorite; hasTeam: boolean }> {
  const query = useFavoritesQuery();
  return () => {
    const type = entityType();
    const id = entityId();
    const data = query.data;
    if (!type || !id || !data) return { hasTeam: !!data?.team };
    const match = (favorite: Favorite) =>
      favorite.entityType === type && favorite.entityId === id;
    return {
      user: data.user.find(match),
      team: data.team?.find(match),
      hasTeam: data.team !== undefined,
    };
  };
}

type FavoriteMutationContext = { rollback: () => void };

type AddFavoriteArgs = AddFavoriteRequest;
type AddFavoriteCallbacks = MutationCallbacks<
  Favorite,
  Error,
  AddFavoriteArgs,
  FavoriteMutationContext
>;

export function useAddFavoriteMutation(callbacks?: AddFavoriteCallbacks) {
  return useMutation(() => ({
    mutationFn: async (args: AddFavoriteArgs) =>
      await throwOnErr(() => storageServiceClient.favorites.addFavorite(args)),
    ...withCallbacks<Favorite, Error, AddFavoriteArgs, FavoriteMutationContext>(
      {
        onMutate: (args: AddFavoriteArgs) => {
          const previous = readList();
          const optimistic: Favorite = {
            id: `optimistic-${args.entityType}-${args.entityId}`,
            scope: args.scope,
            entityType: args.entityType,
            entityId: args.entityId,
            sortOrder: Number.MAX_SAFE_INTEGER,
            createdBy: '',
            createdAt: new Date().toISOString(),
          };
          writeList((prev) =>
            args.scope === 'user'
              ? { ...prev, user: [...prev.user, optimistic] }
              : { ...prev, team: [...(prev.team ?? []), optimistic] }
          );
          return {
            rollback: () => {
              if (previous) {
                queryClient.setQueryData(favoriteKeys.list.queryKey, previous);
              }
            },
          };
        },
        onError: (_error, _args, context) => {
          context?.rollback();
        },
        onSettled: () => invalidateFavorites(),
      },
      callbacks
    ),
  }));
}

type RemoveFavoriteArgs = {
  entityType: FavoriteEntityType;
  entityId: string;
  scope: FavoriteScope;
};
type RemoveFavoriteCallbacks = MutationCallbacks<
  void,
  Error,
  RemoveFavoriteArgs,
  FavoriteMutationContext
>;

export function useRemoveFavoriteMutation(callbacks?: RemoveFavoriteCallbacks) {
  return useMutation(() => ({
    mutationFn: async (args: RemoveFavoriteArgs) => {
      await throwOnErr(() =>
        storageServiceClient.favorites.removeFavoriteByEntity(args)
      );
    },
    ...withCallbacks<void, Error, RemoveFavoriteArgs, FavoriteMutationContext>(
      {
        onMutate: (args: RemoveFavoriteArgs) => {
          const previous = readList();
          const keep = (favorite: Favorite) =>
            !(
              favorite.entityType === args.entityType &&
              favorite.entityId === args.entityId
            );
          writeList((prev) =>
            args.scope === 'user'
              ? { ...prev, user: prev.user.filter(keep) }
              : { ...prev, team: prev.team?.filter(keep) }
          );
          return {
            rollback: () => {
              if (previous) {
                queryClient.setQueryData(favoriteKeys.list.queryKey, previous);
              }
            },
          };
        },
        onError: (_error, _args, context) => {
          context?.rollback();
        },
        onSettled: () => invalidateFavorites(),
      },
      callbacks
    ),
  }));
}

type ReorderFavoritesArgs = {
  scope: FavoriteScope;
  favoriteIds: string[];
};
type ReorderFavoritesCallbacks = MutationCallbacks<
  void,
  Error,
  ReorderFavoritesArgs,
  FavoriteMutationContext
>;

export function useReorderFavoritesMutation(
  callbacks?: ReorderFavoritesCallbacks
) {
  return useMutation(() => ({
    mutationFn: async (args: ReorderFavoritesArgs) => {
      await throwOnErr(() =>
        storageServiceClient.favorites.reorderFavorites(args)
      );
    },
    ...withCallbacks<
      void,
      Error,
      ReorderFavoritesArgs,
      FavoriteMutationContext
    >(
      {
        onMutate: (args: ReorderFavoritesArgs) => {
          const previous = readList();
          const reorder = (favorites: Favorite[]) => {
            const byId = new Map(favorites.map((f) => [f.id, f]));
            const ordered = args.favoriteIds
              .map((id) => byId.get(id))
              .filter((f): f is Favorite => !!f);
            const leftover = favorites.filter(
              (f) => !args.favoriteIds.includes(f.id)
            );
            return [...ordered, ...leftover];
          };
          writeList((prev) =>
            args.scope === 'user'
              ? { ...prev, user: reorder(prev.user) }
              : { ...prev, team: prev.team ? reorder(prev.team) : prev.team }
          );
          return {
            rollback: () => {
              if (previous) {
                queryClient.setQueryData(favoriteKeys.list.queryKey, previous);
              }
            },
          };
        },
        onError: (_error, _args, context) => {
          context?.rollback();
        },
        onSettled: () => invalidateFavorites(),
      },
      callbacks
    ),
  }));
}
