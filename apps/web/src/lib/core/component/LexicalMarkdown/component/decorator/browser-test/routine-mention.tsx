import '@app/index.css';
import { AnalyticsContextProvider } from '@app/lib/analytics/analytics-context';
import { PosthogProvider } from '@app/lib/analytics/posthog';
import { setGlobalSplitManager } from '@app/signal/splitLayout';
import type {
  SplitContent,
  SplitManager,
} from '@components/app/split-layout/layoutManager';
import { render } from 'solid-js/web';
import { channelTheme } from '../../../theme';
import {
  StaticMarkdown,
  StaticMarkdownContext,
} from '../../core/StaticMarkdown';
import { DocumentMention } from '../DocumentMention';

const id = '0195ceb6-ec2e-7023-80e4-6e084fa6cccd';
const mention = `<m-document-mention>${JSON.stringify({
  documentId: id,
  documentName: 'Daily review',
  blockName: 'routine',
})}</m-document-mention>`;

// Only navigation is used by this isolated decorator fixture.
setGlobalSplitManager({
  openWithSplit(content: SplitContent) {
    document.getElementById('opened')!.textContent = JSON.stringify(content);
    return { status: 'unavailable' };
  },
} as SplitManager);

render(
  () => (
    <AnalyticsContextProvider>
      <PosthogProvider>
        <StaticMarkdownContext theme={channelTheme}>
          <main class="p-4 text-ink bg-page">
            <StaticMarkdown
              markdown={`Created ${mention}.`}
              target="internal"
            />
            <p>
              <DocumentMention
                key="collapsed-routine"
                theme={channelTheme}
                documentId={id}
                documentName="Collapsed review"
                blockName="routine"
                collapsed
              />
            </p>
            <output id="opened" aria-label="Opened split" />
          </main>
        </StaticMarkdownContext>
      </PosthogProvider>
    </AnalyticsContextProvider>
  ),
  document.getElementById('root')!
);
