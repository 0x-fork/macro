// Lazy: StaticMarkdown pulls the markdown parsing stack (@lexical/markdown,
// transformers, prism), which would otherwise load with the initial bundle.
const StaticMarkdown = lazy(() =>
  import('@core/component/LexicalMarkdown/component/core/StaticMarkdown').then(
    (m) => ({ default: m.StaticMarkdown })
  )
);

import {
  searchContentHitMarkdownTheme,
  singleLineMarkdownTheme,
  twoLineClampMarkdownTheme,
} from '@core/component/LexicalMarkdown/theme';
import { lazy, Show, Suspense } from 'solid-js';
import type { ContentHitData } from '../types/search';

interface SearchContentProps {
  hit?: ContentHitData;
  twoLineClamp?: boolean;
  singleLine?: boolean;
}

/**
 * Displays the content/snippet of a search hit
 */
export function SearchContent(props: SearchContentProps) {
  const content = () => props.hit?.content ?? '';
  const theme = () => {
    if (props.twoLineClamp) {
      return twoLineClampMarkdownTheme;
    } else if (props.singleLine) {
      return singleLineMarkdownTheme;
    } else {
      return searchContentHitMarkdownTheme;
    }
  };

  return (
    <Show when={content()}>
      {(text) => (
        <Show
          when={text().trim()}
          fallback={<span class="italic text-ink-disabled">No content</span>}
        >
          {(trimmedContent) => (
            <Suspense>
              <StaticMarkdown markdown={trimmedContent()} theme={theme()} />
            </Suspense>
          )}
        </Show>
      )}
    </Show>
  );
}
