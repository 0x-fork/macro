import type { SplitContent } from '@app/component/split-layout/layoutManager';
import { getChannelParams } from '@block-channel/utils/link';
import type { EntityIconSelector } from '@core/component/EntityIcon';
import { getIconConfig } from '@core/component/EntityIcon';
import { fileTypeToBlockName } from '@core/constant/allBlocks';
import {
  defaultNameTransform,
  getCachedItemPreview,
  type ItemEntity,
  isAccessiblePreviewItem,
  useItemPreview,
} from '@queries/preview';
import type { Favorite } from '@service-storage/generated/schemas/favorite';
import type { Accessor } from 'solid-js';

/** The block to open for a favorite (also its URL type segment). */
export function favoriteBlockName(favorite: Favorite) {
  if (favorite.entityType === 'document') {
    return fileTypeToBlockName(favorite.documentSubType ?? favorite.fileType);
  }
  if (favorite.entityType === 'email_thread') return 'email' as const;
  // Passes chat/channel/project/call through and remaps channel_message and
  // CRM entity types to their block names.
  return fileTypeToBlockName(favorite.entityType);
}

/**
 * The split content that opens a favorite. Channel-message favorites open
 * their owning channel (hydrated as `channelId`) focused on the message.
 */
export function favoriteSplitContent(favorite: Favorite): SplitContent {
  if (favorite.entityType === 'channel_message' && favorite.channelId) {
    return {
      type: 'channel',
      id: favorite.channelId,
      params: getChannelParams(favorite.entityId),
    };
  }
  return { type: favoriteBlockName(favorite), id: favorite.entityId };
}

export function favoriteIconType(favorite: Favorite): EntityIconSelector {
  if (
    favorite.entityType === 'channel' ||
    favorite.entityType === 'channel_message'
  ) {
    return (favorite.channelType ?? 'channel') as EntityIconSelector;
  }
  if (favorite.entityType === 'document') {
    // icon: true keeps e.g. docx showing the write icon instead of pdf
    return fileTypeToBlockName(
      favorite.documentSubType ?? favorite.fileType,
      true
    );
  }
  return favoriteBlockName(favorite);
}

/**
 * The preview entity that names a favorite: the favorite's own entity for
 * kinds the preview pipeline covers, the owning channel for channel-message
 * favorites, and undefined for kinds without a preview fetcher
 * (e.g. crm_contact), which fall back to the API-hydrated name.
 */
function favoritePreviewEntity(favorite: Favorite): ItemEntity | undefined {
  switch (favorite.entityType) {
    case 'channel':
      return { id: favorite.entityId, type: 'channel' };
    case 'channel_message':
      return favorite.channelId
        ? { id: favorite.channelId, type: 'channel' }
        : undefined;
    case 'email_thread':
      return { id: favorite.entityId, type: 'email' };
    case 'document':
    case 'chat':
    case 'project':
    case 'call':
    case 'crm_company':
      return { id: favorite.entityId, type: favorite.entityType };
    default:
      return undefined;
  }
}

/**
 * Non-reactive display name for a favorite, read from the preview cache.
 * Previews are the app-wide name pipeline: viewer-relative for DM channels
 * (the favorite itself has no name for those) and written to by optimistic
 * renames, so favorites need no rename special-casing. Falls back to the
 * name hydrated on the favorite, then the entity kind, for previews not yet
 * cached and kinds previews don't cover.
 *
 * Inside components prefer `useFavoriteDisplayName`, which subscribes to the
 * preview instead of only reading whatever happens to be cached.
 */
export function favoriteDisplayName(favorite: Favorite): string {
  const entity = favoritePreviewEntity(favorite);
  const cached = entity && getCachedItemPreview(entity.id);
  if (cached) {
    // The transform `useItemPreview` applies, so both paths agree.
    const preview = defaultNameTransform(cached);
    if (isAccessiblePreviewItem(preview) && preview.name.trim()) {
      return preview.name;
    }
  }
  return (
    favorite.name?.trim() ||
    getIconConfig(favoriteIconType(favorite) ?? 'default').prettyName ||
    'Untitled'
  );
}

/**
 * Reactive display name for a favorite: subscribes to the entity's preview
 * (fetching it if needed) and resolves like `favoriteDisplayName`.
 *
 * Call during component setup. The favorite's identity must be stable for
 * the component's lifetime (favorites lists key rows by entity, so it is).
 */
export function useFavoriteDisplayName(favorite: Favorite): Accessor<string> {
  const entity = favoritePreviewEntity(favorite);
  if (!entity) return () => favoriteDisplayName(favorite);
  const [preview] = useItemPreview(() => entity);
  return () => {
    const item = preview();
    if (isAccessiblePreviewItem(item) && item.name.trim()) return item.name;
    return favoriteDisplayName(favorite);
  };
}
