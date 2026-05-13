import { useSplitLayout } from '@app/component/split-layout/layout';
import { AttachmentEntityRow } from '@channel/Attachments/AttachmentEntityRow';
import { getEntityClickContent } from '@channel/Attachments/attachment-utils';
import {
  AttachmentSection,
  LoadMoreButton,
} from '@channel/Attachments/SectionHeader';
import { DocumentRowSkeleton } from '@channel/Attachments/Skeletons';
import type { EntityData } from '@entity';
import { useSoupAstItemsQuery } from '@queries/soup/items';
import { createMemo, For, Show } from 'solid-js';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const SKELETON_ROW_COUNT = 6;

function buildEmailInvolvementAst(email: string) {
  return {
    '&': [
      {
        '|': [
          {
            '|': [
              {
                '|': [
                  { l: { Sender: { Complete: email } } },
                  { l: { Cc: { Complete: email } } },
                ],
              },
              { l: { Bcc: { Complete: email } } },
            ],
          },
          { l: { Recipient: { Complete: email } } },
        ],
      },
      { l: { Shared: 'exclude' } },
    ],
  };
}

export function ContactEmailsSection(props: { email: string }) {
  const query = useSoupAstItemsQuery(() => ({
    params: { limit: 6, sort_method: 'updated_at' },
    body: {
      df: { l: { id: NIL_UUID } },
      ef: buildEmailInvolvementAst(props.email),
      chanf: { l: { ChannelId: NIL_UUID } },
      cf: { l: { cid: NIL_UUID } },
      pf: { l: { pid: NIL_UUID } },
      callf: { l: { CallId: NIL_UUID } },
      emailView: 'all',
    },
  }));

  const { replaceOrInsertSplit } = useSplitLayout();

  const entities = createMemo<EntityData[]>(() => query.data ?? []);

  const handleEntityClick = (entity: EntityData) =>
    replaceOrInsertSplit(getEntityClickContent(entity));

  return (
    <AttachmentSection
      label="Emails"
      class="flex flex-1 min-h-0 flex-col md:flex-none"
      contentClass="flex flex-1 min-h-0 flex-col"
    >
      <Show
        when={!query.isLoading}
        fallback={
          <For each={Array.from({ length: SKELETON_ROW_COUNT })}>
            {() => <DocumentRowSkeleton />}
          </For>
        }
      >
        <Show
          when={entities().length > 0}
          fallback={
            <div class="py-3 text-sm text-ink-faint">
              No emails involving this contact.
            </div>
          }
        >
          <div class="min-h-0 h-full overflow-y-auto md:h-105">
            <For each={entities()}>
              {(entity) => (
                <AttachmentEntityRow
                  entity={entity}
                  onClick={() => handleEntityClick(entity)}
                />
              )}
            </For>
            <Show when={query.hasNextPage}>
              <LoadMoreButton
                onLoadMore={() => query.fetchNextPage()}
                isFetching={() => query.isFetchingNextPage}
              />
            </Show>
          </div>
        </Show>
      </Show>
    </AttachmentSection>
  );
}
