import { List } from '@app/components/list';
import { registerDocumentsFilterSplit } from '@app/features/next-soup/soup-view/documents-filter-controllers';
import {
  SoupCollectionProvider,
  useSoupCollection,
} from '@app/features/soup-list';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { onCleanup, onMount } from 'solid-js';
import { SoupViewProvider } from '../../context';
import { DefaultListViewContent } from '../default-list-view';
import { useSoupViewSetup } from '../use-soup-view-setup';

export type DocumentsListViewProps = {
  viewName?: string;
};

function DocumentsListViewContent() {
  const collection = useSoupCollection();
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
  const setup = useSoupViewSetup({ view: 'documents' });

  return (
    <SoupCollectionProvider value={setup.collection}>
      <List.Root
        dataSource={setup.collection.dataSource}
        state={setup.listState}
      >
        <SoupViewProvider
          view="documents"
          viewName={props.viewName ?? 'Documents'}
        >
          <DocumentsListViewContent />
        </SoupViewProvider>
      </List.Root>
    </SoupCollectionProvider>
  );
}
