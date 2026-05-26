import { createMemo, Show, Suspense } from 'solid-js';
import { VList } from 'virtua/solid';
import { useSplitLayout } from '@app/component/split-layout/layout';
import type { EntityData } from '@entity';
import type { ApiChannelAttachment } from '@service-comms/client';
import { useSoupItemsQuery } from '@queries/soup/items';
import {
  flattenAttachments,
  useChannelDocumentAttachmentsQuery,
  type ChannelAttachmentsData,
} from '@queries/channel/channel-attachments';
import {
  buildAttachmentEntityFilters,
  getEntityClickContent,
} from './attachment-utils';
import { AttachmentEntityRow } from './AttachmentEntityRow';

export function ChannelDocumentsTab(props: { channelId: string }) {
  const attachmentsQuery = useChannelDocumentAttachmentsQuery(
    () => props.channelId
  );

  const documentAttachments = createMemo(() =>
    flattenAttachments(
      attachmentsQuery.data as ChannelAttachmentsData | undefined
    )
  );

  const soupQuery = useSoupItemsQuery(
    () => ({
      params: { limit: 500 },
      body: buildAttachmentEntityFilters(documentAttachments()),
    }),
    () => ({ enabled: documentAttachments().length > 0 })
  );

  const attachmentByEntityId = createMemo(() => {
    const map = new Map<string, ApiChannelAttachment>();
    for (const attachment of documentAttachments()) {
      map.set(attachment.entity_id, attachment);
    }
    return map;
  });

  const { replaceOrInsertSplit } = useSplitLayout();
  const handleEntityClick = (entity: EntityData) =>
    replaceOrInsertSplit(getEntityClickContent(entity));

  const rows = createMemo(() => {
    const entities = soupQuery.data ?? [];
    const lookup = attachmentByEntityId();

    return [...entities]
      .sort((a, b) => {
        const aTime = lookup.get(a.id)?.created_at ?? '';
        const bTime = lookup.get(b.id)?.created_at ?? '';
        return bTime.localeCompare(aTime);
      })
      .map((entity) => {
        const attachment = lookup.get(entity.id);
        return {
          entity,
          timestamp: attachment?.created_at,
          senderId: attachment?.sender_id,
          onClick: () => handleEntityClick(entity),
        };
      });
  });

  const hasDocuments = () => rows().length > 0;

  const handleScrollEnd = () => {
    if (attachmentsQuery.hasNextPage && !attachmentsQuery.isFetchingNextPage) {
      attachmentsQuery.fetchNextPage();
    }
  };

  return (
    <Suspense fallback={<div class="py-3 text-sm text-ink-muted">Loading...</div>}>
      <div class="h-full flex flex-col">
        <Show when={!hasDocuments() && !attachmentsQuery.isLoading}>
          <div class="py-3 text-sm text-ink-faint">
            No documents in this channel yet.
          </div>
        </Show>

        <Show when={hasDocuments()}>
          <div class="flex-1">
            <VList
              data={rows()}
              onScrollEnd={handleScrollEnd}
              class="h-full"
            >
              {(row) => (
                <div class="pb-1">
                  <AttachmentEntityRow
                    entity={row.entity}
                    timestamp={row.timestamp}
                    senderId={row.senderId}
                    onClick={row.onClick}
                  />
                </div>
              )}
            </VList>
          </div>
          <Show when={attachmentsQuery.isFetchingNextPage}>
            <div class="py-2 text-center text-sm text-ink-muted">Loading...</div>
          </Show>
        </Show>
      </div>
    </Suspense>
  );
}
