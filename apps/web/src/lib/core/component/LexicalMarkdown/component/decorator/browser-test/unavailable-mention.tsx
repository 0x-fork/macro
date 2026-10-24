import '@app/index.css';
import { AnalyticsContextProvider } from '@app/lib/analytics/analytics-context';
import { PosthogProvider } from '@app/lib/analytics/posthog';
import type { BlockName } from '@core/block';
import { UserContextProvider } from '@core/context/user';
import { authKeys } from '@queries/auth/keys';
import type { UserInfoData } from '@queries/auth/user-info';
import { queryClient } from '@queries/client';
import { previewKeys } from '@queries/preview/keys';
import type { PreviewItem, PreviewItemNoAccess } from '@queries/preview/types';
import { MemoryRouter, Route } from '@solidjs/router';
import { QueryClientProvider } from '@tanstack/solid-query';
import {
  KEY_ENTER_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
} from 'lexical';
import { For } from 'solid-js';
import { render } from 'solid-js/web';
import { LexicalWrapperContext } from '../../../context/LexicalWrapperContext';
import type { PluginManager, SelectionData } from '../../../plugins';
import { channelTheme } from '../../../theme';
import { StaticMarkdownContext } from '../../core/StaticMarkdown';
import { DocumentMention } from '../DocumentMention';

// The previews answer as the API does for an item deleted (or a meeting
// cancelled) since it was mentioned, or one the viewer can't open.
const mentions = [
  {
    label: 'Deleted event',
    id: '01a16d55-0000-7000-8000-000000000001',
    blockName: 'calendar',
    preview: { type: 'calendar_event', access: 'does_not_exist' },
  },
  {
    label: 'Deleted document',
    id: '01a16d55-0000-7000-8000-000000000002',
    blockName: 'md',
    preview: { type: 'document', access: 'does_not_exist' },
  },
  {
    label: 'Deleted channel',
    id: '01a16d55-0000-7000-8000-000000000003',
    blockName: 'channel',
    preview: { type: 'channel', access: 'does_not_exist' },
  },
  {
    label: 'Hidden event',
    id: '01a16d55-0000-7000-8000-000000000004',
    blockName: 'calendar',
    preview: { type: 'calendar_event', access: 'no_access' },
  },
] as const satisfies ReadonlyArray<{
  label: string;
  id: string;
  blockName: BlockName;
  preview: Pick<PreviewItemNoAccess, 'type' | 'access'>;
}>;

for (const mention of mentions) {
  queryClient.setQueryData(previewKeys.item(mention.id).queryKey, {
    id: mention.id,
    ...mention.preview,
    loading: false,
  } satisfies PreviewItem);
}
// A signed-in viewer: the no-access card sends anyone else to sign in.
queryClient.setQueryData(authKeys.userInfo.queryKey, {
  authenticated: true,
  email: 'viewer@example.com',
} as UserInfoData);

declare global {
  interface Window {
    pressEnterOnSelectedMention?: () => boolean;
  }
}

// An editor holding the deleted document's chip as its node selection, so
// Enter reaches the chip's KEY_ENTER_COMMAND handler as it does in a composer.
const selectedMentionKey = 'selected-deleted-document';
const editor = {
  registerCommand: <T,>(
    command: LexicalCommand<T>,
    handler: (payload: T) => boolean
  ) => {
    if (command === KEY_ENTER_COMMAND) {
      window.pressEnterOnSelectedMention = () =>
        (handler as (event: KeyboardEvent | null) => boolean)(null);
    }
    return () => {};
  },
  isEditable: () => false,
  hasNode: () => false,
  update: () => {},
  dispatchCommand: () => true,
};

function SelectedMention() {
  const selection = {
    type: 'node',
    nodeKeys: new Set([selectedMentionKey]),
  } as SelectionData;
  return (
    <LexicalWrapperContext.Provider
      value={{
        type: 'markdown',
        owner: null,
        plugins: {} as PluginManager,
        editor: editor as unknown as LexicalEditor,
        cleanup: () => {},
        isInteractable: () => true,
        selection,
      }}
    >
      <DocumentMention
        key={selectedMentionKey}
        theme={channelTheme}
        documentId={mentions[1].id}
        documentName="Planning"
        blockName={mentions[1].blockName}
        createdAt={Date.now() - 10 * 60 * 1000}
      />
    </LexicalWrapperContext.Provider>
  );
}

function Fixture() {
  return (
    <main class="p-4 text-ink bg-page space-y-2">
      <For each={mentions}>
        {(mention) => (
          <p>
            {mention.label}:{' '}
            <DocumentMention
              key={mention.id}
              theme={channelTheme}
              documentId={mention.id}
              documentName="Planning"
              blockName={mention.blockName}
              createdAt={Date.now() - 10 * 60 * 1000}
            />
          </p>
        )}
      </For>
      <p>
        Selected in an editor: <SelectedMention />
      </p>
    </main>
  );
}

render(
  () => (
    <AnalyticsContextProvider>
      <PosthogProvider>
        <QueryClientProvider client={queryClient}>
          <UserContextProvider>
            <StaticMarkdownContext theme={channelTheme}>
              <MemoryRouter>
                <Route path="*" component={Fixture} />
              </MemoryRouter>
            </StaticMarkdownContext>
          </UserContextProvider>
        </QueryClientProvider>
      </PosthogProvider>
    </AnalyticsContextProvider>
  ),
  document.getElementById('root')!
);
