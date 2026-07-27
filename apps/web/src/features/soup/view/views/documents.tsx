import { List } from '@app/components/list';
import { useSoupView } from '@app/features/soup/view/context';
import { registerDocumentsFilterSplit } from '@app/features/soup/view/views/documents-filter-controllers';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { onCleanup, onMount } from 'solid-js';
import { SoupViewProvider } from '../context';
import { createSoupList } from '../primitives/create-soup-list';
import { DefaultListViewContent } from './default-list-view';

export type DocumentsListViewProps = {
  viewName?: string;
};

function DocumentsListViewContent() {
  const { collection } = useSoupView();
  const panel = useSplitPanelOrThrow();
  onMount(() => {
    const teardown = registerDocumentsFilterSplit(panel.handle.id, {
      toggleMarkdownFilter: () =>
        collection.facets.toggle('type', 'doc-markdown'),
    });
    onCleanup(teardown);
  });
  return <DefaultListViewContent />;
}

export function DocumentsListView(props: DocumentsListViewProps) {
  const setup = createSoupList({ view: 'documents' });

  return (
    <List.Root state={setup.list}>
      <SoupViewProvider
        soup={setup}
        view="documents"
        viewName={props.viewName ?? 'Documents'}
      >
        <DocumentsListViewContent />
      </SoupViewProvider>
    </List.Root>
  );
}
