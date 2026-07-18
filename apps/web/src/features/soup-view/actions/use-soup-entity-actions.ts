import { useList } from '@app/components/list';
import { openBulkEditModal } from '@app/features/entity/bulk-edit/BulkEditEntityModal';
import {
  applyEntitiesDoneOptimistic,
  executeMarkEntitiesDone,
  openEntityInSplitFromUnifiedList,
  resolveMarkEntitiesDoneVariables,
  trashEmails,
} from '@app/features/next-soup/utils';
import { openPropertyEditor } from '@app/features/property/editor/state/propertyEditor';
import { type SoupItem, useSoupCollection } from '@app/features/soup-list';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { getChannelParams } from '@block-channel/utils/link';
import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { toast } from '@core/component/Toast/Toast';
import { fileTypeToBlockName } from '@core/constant/allBlocks';
import {
  ENABLE_TAGS_FE_FLAG,
  ENABLE_TAGS_FE_OVERRIDE,
} from '@core/constant/featureFlags';
import { useUserId } from '@core/context/user';
import { buildSimpleEntityUrl } from '@core/util/url';
import { type EntityData, isGithubPrEntity } from '@entity';
import CheckCircleIcon from '@phosphor/check-circle.svg';
import CopyIcon from '@phosphor/copy.svg';
import HeartIcon from '@phosphor/heart.svg';
import LinkIcon from '@phosphor/link.svg';
import PencilSimpleIcon from '@phosphor/pencil-simple.svg';
import SidebarSimpleIcon from '@phosphor/sidebar-simple.svg';
import SlidersIcon from '@phosphor/sliders-horizontal.svg';
import TagIcon from '@phosphor/tag.svg';
import TrashIcon from '@phosphor/trash.svg';
import {
  favoriteEntityType,
  useAddFavoriteMutation,
  useFavoritesData,
  useRemoveFavoriteMutation,
} from '@queries/favorites/favorites';
import type { Component, JSX } from 'solid-js';
import { useSoupView } from '../context';
import { useIsNewInbox } from '../utils';
import {
  canDeleteSoupEntity,
  canRenameSoupEntity,
} from './soup-entity-action-model';

const MARK_DONE_VIEWS = new Set([
  'inbox-signal',
  'inbox-noise',
  'mail-important',
  'mail-all',
  'mail-noise',
  'mail-shared',
]);

export type SoupEntityAction = {
  id:
    | 'mark-done'
    | 'open-split'
    | 'favorite'
    | 'rename'
    | 'properties'
    | 'tags'
    | 'copy-link'
    | 'copy-id'
    | 'delete';
  label: string;
  icon: Component<JSX.SvgSVGAttributes<SVGSVGElement>>;
  destructive?: boolean;
  run: () => void | Promise<void>;
};

const copyToClipboard = async (
  value: string,
  success: string,
  failure: string
) => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(success);
  } catch {
    toast.failure(failure);
  }
};

const entityUrl = (entity: EntityData) => {
  if (isGithubPrEntity(entity)) return entity.metadata.url;
  if (entity.type === 'channel_message' || entity.type === 'channel_thread') {
    return buildSimpleEntityUrl(
      { type: 'channel', id: entity.channelId },
      getChannelParams(entity.messageId, entity.threadId)
    );
  }
  const type =
    entity.type === 'document'
      ? fileTypeToBlockName(entity.subType?.type ?? entity.fileType)
      : entity.type;
  return buildSimpleEntityUrl({ type, id: entity.id });
};

export function useSoupEntityActions() {
  const collection = useSoupCollection();
  const panel = useSplitPanelOrThrow();
  const { state: listState } = useList<SoupItem>();
  const view = useSoupView();
  const isNewInbox = useIsNewInbox();
  const userId = useUserId();
  const notificationSource = useGlobalNotificationSource();
  const tagsFlag = useFeatureFlag(ENABLE_TAGS_FE_FLAG, {
    enabledOverride: ENABLE_TAGS_FE_OVERRIDE,
  });
  const favoritesData = useFavoritesData();
  const addFavorite = useAddFavoriteMutation();
  const removeFavorite = useRemoveFavoriteMutation();
  const onRemove = (entityIds: readonly string[]) => {
    for (const id of entityIds) listState.selection.deselect(`entity:${id}`);
  };
  const openInSplit = (entity: EntityData) => {
    void openEntityInSplitFromUnifiedList(entity, {
      splitHandle: panel.handle,
      referredFrom: view.view(),
      openInNewSplit: true,
    });
  };

  const isFavorited = (entity: EntityData) => {
    const type = favoriteEntityType(entity.type);
    return (
      type !== undefined &&
      (favoritesData()?.favorites ?? []).some(
        (favorite) =>
          favorite.entityType === type && favorite.entityId === entity.id
      )
    );
  };

  const toggleFavorites = async (entities: readonly EntityData[]) => {
    const supported = entities.filter(
      (entity) => favoriteEntityType(entity.type) !== undefined
    );
    if (
      supported.length === 0 ||
      addFavorite.isPending ||
      removeFavorite.isPending
    ) {
      return;
    }
    const remove = supported.every(isFavorited);
    const targets = remove
      ? supported
      : supported.filter((entity) => !isFavorited(entity));
    const results = await Promise.allSettled(
      targets.map((entity) => {
        const entityType = favoriteEntityType(entity.type);
        if (!entityType) return Promise.resolve();
        const args = { entityType, entityId: entity.id };
        return remove
          ? removeFavorite.mutateAsync(args)
          : addFavorite.mutateAsync(args);
      })
    );
    const failures = results.filter(
      (result) => result.status === 'rejected'
    ).length;
    if (failures === results.length) {
      toast.failure('Failed to update favorites');
    } else if (failures > 0) {
      toast.failure(`Failed to update ${failures} favorites`);
    } else {
      toast.success(remove ? 'Removed from favorites' : 'Added to favorites');
    }
  };

  const trash = (emails: readonly EntityData[]) => {
    const handle = trashEmails(emails.map((entity) => entity.id));
    onRemove(emails.map((entity) => entity.id));
    const toastId = toast.success(
      emails.length > 1
        ? `Moved ${emails.length} items to Trash`
        : 'Moved to Trash',
      {
        actions: [
          {
            label: 'Undo',
            onClick: () => {
              if (toastId !== undefined) toast.dismiss(toastId);
              void handle.undo().then(
                () => toast.success('Restored from Trash'),
                () => toast.failure('Failed to restore from Trash')
              );
            },
          },
        ],
        duration: 10_000,
      }
    );
    handle.done.catch(() => toast.failure('Failed to move to Trash'));
  };

  const canDelete = (entity: EntityData) =>
    canDeleteSoupEntity(entity, userId());

  const removeEntities = (entities: readonly EntityData[]) => {
    const emails = entities.filter((entity) => entity.type === 'email');
    const editable = entities.filter(
      (entity) => entity.type !== 'email' && canDelete(entity)
    );
    const finish = () => {
      onRemove(editable.map((entity) => entity.id));
      if (emails.length > 0) trash(emails);
    };
    if (editable.length > 0) {
      openBulkEditModal({
        view: 'delete',
        entities: editable,
        onFinish: finish,
      });
    } else if (emails.length > 0) {
      trash(emails);
    }
  };

  const canMarkDone = (entity: EntityData) => {
    if (entity.type === 'channel_message' || entity.type === 'call')
      return false;
    if (entity.type === 'channel_thread') return isNewInbox();
    return (
      entity.type === 'email' ||
      entity.type === 'channel' ||
      entity.type === 'chat' ||
      entity.type === 'document' ||
      entity.type === 'project' ||
      entity.type === 'foreign'
    );
  };

  const markDone = async (entities: readonly EntityData[]) => {
    const variables = resolveMarkEntitiesDoneVariables({
      entities: [...entities],
      notificationSource,
      scopeChannelNotificationsToEntity: isNewInbox(),
    });
    const optimistic = applyEntitiesDoneOptimistic({
      entityIds: entities.map((entity) => entity.id),
      emailIds: variables.emailIds,
      notificationIds: variables.notificationIds,
    });
    onRemove(entities.map((entity) => entity.id));
    try {
      await executeMarkEntitiesDone(variables);
      toast.success(
        entities.length > 1
          ? `Marked ${entities.length} items as done`
          : 'Marked as done'
      );
    } catch {
      optimistic.rollback();
      toast.failure('Failed to mark as done');
    }
  };

  const canEditProperties = (entity: EntityData) =>
    entity.type === 'document' ||
    entity.type === 'project' ||
    entity.type === 'chat' ||
    entity.type === 'crm_company';

  const build = (
    entities: readonly EntityData[],
    context: { editTags?: () => void } = {}
  ): SoupEntityAction[] => {
    if (entities.length === 0) return [];
    const first = entities[0];
    const actions: SoupEntityAction[] = [];
    if (
      MARK_DONE_VIEWS.has(`${view.view()}-${collection.activeTab()}`) &&
      entities.every(canMarkDone)
    ) {
      actions.push({
        id: 'mark-done',
        label: entities.length === 1 ? 'Mark done' : 'Mark items done',
        icon: CheckCircleIcon,
        run: () => markDone(entities),
      });
    }
    if (entities.length === 1 && first.type !== 'foreign') {
      actions.push({
        id: 'open-split',
        label: 'Open in new split',
        icon: SidebarSimpleIcon,
        run: () => openInSplit(first),
      });
    }
    if (
      entities.every((entity) => favoriteEntityType(entity.type) !== undefined)
    ) {
      actions.push({
        id: 'favorite',
        label: entities.every(isFavorited)
          ? 'Remove from favorites'
          : 'Add to favorites',
        icon: HeartIcon,
        run: () => toggleFavorites(entities),
      });
    }
    if (entities.every((entity) => canRenameSoupEntity(entity, userId()))) {
      actions.push({
        id: 'rename',
        label: entities.length === 1 ? 'Rename' : 'Rename items',
        icon: PencilSimpleIcon,
        run: () =>
          openBulkEditModal({
            view: 'rename',
            entities: [...entities],
            onFinish: () => toast.success('Renamed'),
          }),
      });
    }
    if (entities.every(canEditProperties)) {
      actions.push({
        id: 'properties',
        label: 'Edit properties',
        icon: SlidersIcon,
        run: () => openPropertyEditor([...entities]),
      });
    }
    if (entities.length === 1 && context.editTags && tagsFlag().enabled) {
      actions.push({
        id: 'tags',
        label: 'Edit tags',
        icon: TagIcon,
        run: context.editTags,
      });
    }
    if (entities.length === 1) {
      actions.push({
        id: 'copy-link',
        label: 'Copy link',
        icon: LinkIcon,
        run: () =>
          copyToClipboard(
            entityUrl(first),
            'Link copied to clipboard',
            'Failed to copy link'
          ),
      });
    }
    actions.push({
      id: 'copy-id',
      label: entities.length === 1 ? 'Copy ID' : 'Copy IDs',
      icon: CopyIcon,
      run: () =>
        copyToClipboard(
          entities.map((entity) => entity.id).join('\n'),
          entities.length === 1
            ? 'ID copied to clipboard'
            : `${entities.length} IDs copied to clipboard`,
          'Failed to copy IDs'
        ),
    });
    if (entities.every(canDelete)) {
      actions.push({
        id: 'delete',
        label: entities.length === 1 ? 'Delete' : `Delete ${entities.length}`,
        icon: TrashIcon,
        destructive: true,
        run: () => removeEntities(entities),
      });
    }
    return actions;
  };

  return { build };
}
