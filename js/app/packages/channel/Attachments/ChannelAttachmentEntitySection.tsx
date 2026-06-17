import {
  type ChannelAttachmentsData,
  flattenAttachments,
  useChannelDocumentAttachmentsQuery,
} from '@queries/channel/channel-attachments';
import { DEFAULT_ITEM_TYPE, stringToItemType } from '@service-storage/client';
import { createMemo } from 'solid-js';
import {
  AttachmentEntityList,
  type AttachmentEntityListRow,
} from './AttachmentEntityList';

export function ChannelAttachmentEntitySection(props: { channelId: string }) {
  const attachmentsQuery = useChannelDocumentAttachmentsQuery(
    () => props.channelId
  );

  // De-duplicate by referenced entity (the same document can be attached in
  // many messages) keeping the newest occurrence. Each row resolves the entity
  // by id in AttachmentEntityRow, so — unlike the previous soup-listing
  // approach — documents outside the viewer's recent soup are still shown.
  const rows = createMemo<AttachmentEntityListRow[]>(() => {
    const attachments = flattenAttachments(
      attachmentsQuery.data as ChannelAttachmentsData | undefined
    );

    const seen = new Set<string>();
    const out: AttachmentEntityListRow[] = [];
    for (const a of attachments) {
      if (seen.has(a.entity_id)) continue;
      seen.add(a.entity_id);
      out.push({
        entityId: a.entity_id,
        entityType: stringToItemType(a.entity_type) ?? DEFAULT_ITEM_TYPE,
        senderId: a.sender_id,
        timestamp: a.created_at,
      });
    }
    return out;
  });

  return (
    <AttachmentEntityList
      rows={rows()}
      hasNextPage={!!attachmentsQuery.hasNextPage}
      isFetchingNextPage={attachmentsQuery.isFetchingNextPage}
      onLoadMore={() => attachmentsQuery.fetchNextPage()}
    />
  );
}
