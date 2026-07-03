import { SidePanel } from '@app/component/side-panel';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { useBlockId } from '@core/block';
import { DocumentMention } from '@core/component/LexicalMarkdown/component/decorator/DocumentMention';
import {
  ENABLE_SIMILAR_DOCUMENTS_FLAG,
  ENABLE_SIMILAR_DOCUMENTS_OVERRIDE,
} from '@core/constant/featureFlags';
import { useSimilarDocumentsQuery } from '@queries/storage/similar-documents';
import type { SimilarDocument } from '@service-storage/client';
import { cn } from '@ui';
import { createMemo, For, Show, Suspense } from 'solid-js';

/**
 * "Similar Documents" side-panel section for plain markdown documents.
 *
 * Uses the same embedding similarity system as task duplicate detection to
 * surface related documents. Collapsed by default — the header shows just the
 * match count — and only mounted when there is at least one match.
 */
export function SimilarDocumentsSidePanelSection() {
  const flag = useFeatureFlag(ENABLE_SIMILAR_DOCUMENTS_FLAG, {
    enabledOverride: ENABLE_SIMILAR_DOCUMENTS_OVERRIDE,
  });
  const blockId = useBlockId();
  const query = useSimilarDocumentsQuery(
    () => blockId,
    () => flag().enabled
  );

  const documents = createMemo(() => query.data ?? []);
  const count = createMemo(() => documents().length);

  return (
    <Show when={flag().enabled}>
      <Suspense>
        <Show when={count() > 0}>
          <SidePanel.Section
            id="similar-documents"
            title={
              <SidePanel.CountTitle label="Similar Documents" count={count()} />
            }
            order={55}
          >
            <div class="flex flex-col gap-1">
              <For each={documents()}>
                {(document) => <SimilarDocumentRow document={document} />}
              </For>
            </div>
          </SidePanel.Section>
        </Show>
      </Suspense>
    </Show>
  );
}

function SimilarDocumentRow(props: { document: SimilarDocument }) {
  return (
    <div class={cn('rounded-lg px-2 py-1.5', 'hover:bg-surface-hover')}>
      <div class="flex min-w-0 items-center">
        <span class="min-w-0 flex-1 truncate text-xs">
          <DocumentMention
            key={props.document.documentId}
            documentId={props.document.documentId}
            documentName={props.document.documentName || 'Untitled document'}
            blockName="md"
            theme={{}}
          />
        </span>
      </div>
    </div>
  );
}
