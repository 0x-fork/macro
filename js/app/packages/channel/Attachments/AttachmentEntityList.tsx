import { For, Show } from 'solid-js';
import {
  AttachmentEntityRow,
  type AttachmentEntityRowData,
} from './AttachmentEntityRow';
import { AttachmentSection, LoadMoreButton } from './SectionHeader';

export type AttachmentEntityListRow = AttachmentEntityRowData;

export function AttachmentEntityList(props: {
  rows: AttachmentEntityListRow[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const hasDocuments = () => props.rows.length > 0;

  return (
    <AttachmentSection label="Documents">
      <div class="grid grid-cols-1">
        <Show when={!hasDocuments()}>
          <div class="py-3 px-6 text-sm text-ink-faint">
            No documents in this channel yet.
          </div>
        </Show>

        <Show when={hasDocuments()}>
          <For each={props.rows}>
            {(row) => <AttachmentEntityRow {...row} />}
          </For>

          <Show when={props.hasNextPage}>
            <LoadMoreButton
              onLoadMore={props.onLoadMore}
              isFetching={() => props.isFetchingNextPage}
            />
          </Show>
        </Show>
      </div>
    </AttachmentSection>
  );
}
