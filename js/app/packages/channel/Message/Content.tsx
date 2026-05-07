import { Show, createMemo } from 'solid-js';

import { channelTheme } from '@core/component/LexicalMarkdown/theme';
import { isEmojiOnly } from '@core/util/string';
import { cn } from '@ui/utils/classname';
import { useMessage } from './context';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';

type ContentProps = {
  class?: string;
};

export function Content(props: ContentProps) {
  const message = useMessage();
  const bigEmoji = createMemo(() => isEmojiOnly(message().content ?? ''));

  const hasContent = () => !!message().content?.trim();

  return (
    <Show when={hasContent()}>
      <div
        class={cn(
          'whitespace-pre-wrap wrap-break-word max-w-full',
          bigEmoji() ? 'text-4xl' : 'text-sm text-ink/85',
          props.class
        )}
      >
        <StaticMarkdown
          markdown={message().content ?? ''}
          theme={channelTheme}
          target="internal"
        />
      </div>
    </Show>
  );
}
