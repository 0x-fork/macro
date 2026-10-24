import '@app/index.css';
import { AnalyticsContextProvider } from '@app/lib/analytics/analytics-context';
import { PosthogProvider } from '@app/lib/analytics/posthog';
import { queryClient } from '@queries/client';
import { previewKeys } from '@queries/preview/keys';
import type { PreviewItem } from '@queries/preview/types';
import { MemoryRouter, Route } from '@solidjs/router';
import { QueryClientProvider } from '@tanstack/solid-query';
import { render } from 'solid-js/web';
import { channelTheme } from '../../../theme';
import { StaticMarkdownContext } from '../../core/StaticMarkdown';
import { DocumentMention } from '../DocumentMention';

const id = '01a16d55-0000-7000-8000-000000000001';

// The preview API answers does_not_exist for a meeting deleted or cancelled
// since it was mentioned.
queryClient.setQueryData(previewKeys.item(id).queryKey, {
  id,
  type: 'calendar_event',
  access: 'does_not_exist',
  loading: false,
} satisfies PreviewItem);

function Fixture() {
  return (
    <main class="p-4 text-ink bg-page">
      <p>
        Shared earlier:{' '}
        <DocumentMention
          key="deleted-event"
          theme={channelTheme}
          documentId={id}
          documentName="Planning"
          blockName="calendar"
          createdAt={Date.now() - 10 * 60 * 1000}
        />
      </p>
    </main>
  );
}

render(
  () => (
    <AnalyticsContextProvider>
      <PosthogProvider>
        <QueryClientProvider client={queryClient}>
          <StaticMarkdownContext theme={channelTheme}>
            <MemoryRouter>
              <Route path="*" component={Fixture} />
            </MemoryRouter>
          </StaticMarkdownContext>
        </QueryClientProvider>
      </PosthogProvider>
    </AnalyticsContextProvider>
  ),
  document.getElementById('root')!
);
