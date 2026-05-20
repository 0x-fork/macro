import { EntityIcon } from '@core/component/EntityIcon';
import { TruncatedText } from '@core/component/FileList/TruncatedText';
import CaretRight from '@phosphor/caret-right.svg?component-solid';
import List from '@phosphor-icons/core/regular/list.svg';
import type { NamedTool } from '@service-cognition/generated/tools/tool';
import { useSplitLayout } from 'app/component/split-layout/layout';
import { createMemo, createSignal, Show } from 'solid-js';
import { match } from 'ts-pattern';
import { VList } from 'virtua/solid';
import { BaseTool } from './BaseTool';
import { createToolRenderer } from './ToolRenderer';

type ListEntitiesItem = NamedTool<
  'ListEntities',
  'response'
>['data']['items'][number];

const ListEntitiesToolResponse = (props: {
  items: ListEntitiesItem[];
  summary: string;
}) => {
  const results = createMemo(() => {
    const seen = new Set<string>();
    return props.items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  });

  const getItemTitle = (item: ListEntitiesItem): string => {
    return match(item)
      .with({ type: 'document' }, (i) => i.name || 'Document')
      .with({ type: 'aiChat' }, (i) => i.name || 'Chat')
      .with({ type: 'project' }, (i) => i.name || 'Project')
      .with({ type: 'email' }, (i) => i.subject || 'Email')
      .with({ type: 'channel' }, (i) => i.name || 'Channel')
      .otherwise(() => 'Item');
  };

  const getIconType = (item: ListEntitiesItem) => {
    return match(item)
      .with({ type: 'document' }, () => 'default' as const)
      .with({ type: 'aiChat' }, () => 'chat' as const)
      .with({ type: 'project' }, () => 'project' as const)
      .with({ type: 'email' }, () => 'email' as const)
      .with({ type: 'channel' }, () => 'channel' as const)
      .otherwise(() => 'default' as const);
  };

  const { replaceOrInsertSplit } = useSplitLayout();

  const getClickHandler = (item: ListEntitiesItem) => {
    return match(item)
      .with({ type: 'document' }, (i) => () => {
        replaceOrInsertSplit({ type: 'unknown', id: i.id });
      })
      .with({ type: 'aiChat' }, (i) => () => {
        replaceOrInsertSplit({ type: 'chat', id: i.id });
      })
      .with({ type: 'project' }, (i) => () => {
        replaceOrInsertSplit({ type: 'project', id: i.id });
      })
      .with({ type: 'email' }, (i) => () => {
        replaceOrInsertSplit({ type: 'email', id: i.id });
      })
      .with({ type: 'channel' }, (i) => () => {
        replaceOrInsertSplit({ type: 'channel', id: i.id });
      })
      .otherwise(() => undefined);
  };

  return (
    <div class="max-h-120 overflow-hidden">
      <VList
        data={results()}
        bufferSize={5 * 32}
        itemSize={32}
        style={{
          height: `${Math.min(results().length * 32, 480)}px`,
          contain: 'content',
        }}
      >
        {(item) => {
          const clickHandler = getClickHandler(item);

          return (
            <div
              class="flex items-center w-full h-8 px-2 hover:bg-hover transition-colors"
              onClick={clickHandler}
            >
              <div class="flex items-center flex-1 min-w-0 gap-2">
                <EntityIcon
                  size="sm"
                  targetType={getIconType(item)}
                  shared={false}
                />
                <div class="flex-1 min-w-0">
                  <TruncatedText size="sm">
                    <span>{getItemTitle(item)}</span>
                  </TruncatedText>
                </div>
              </div>
            </div>
          );
        }}
      </VList>
    </div>
  );
};

const handler = createToolRenderer({
  name: 'ListEntities',
  render: (ctx) => {
    const [isExpanded, setIsExpanded] = createSignal(false);
    const items = () => ctx.response?.data.items ?? [];
    const dedupedCount = () => {
      const seen = new Set<string>();
      let count = 0;

      for (const item of items()) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        count += 1;
      }

      return count;
    };
    const hasResults = () => dedupedCount() > 0;
    const statusText = () => {
      if (!ctx.response) return undefined;
      if (dedupedCount() === 0) return 'No Results';
      if (dedupedCount() === 1) return '1 item';
      return `${dedupedCount()} items`;
    };

    return (
      <BaseTool
        icon={List}
        renderContext={ctx.renderContext}
        type="call"
        response={
          hasResults() && isExpanded() ? (
            <ListEntitiesToolResponse
              items={items()}
              summary={ctx.response?.data.summary ?? ''}
            />
          ) : undefined
        }
      >
        <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <span>
              Filter for{' '}
              <span class="text-accent">
                {ctx.tool.data.includeTypes
                  ? ctx.tool.data.includeTypes.join(', ')
                  : 'All'}
              </span>{' '}
              ordered by{' '}
              <span class="text-accent">
                {ctx.tool.data.sortBy?.split('_').join(' ') ?? 'default'}
              </span>
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <Show when={statusText()}>
              {(text) => (
                <span class="text-xs text-ink-extra-muted">{text()}</span>
              )}
            </Show>
            <Show when={hasResults()}>
              <button
                type="button"
                class="shrink-0 text-ink-muted hover:text-ink p-1"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsExpanded((expanded) => !expanded);
                }}
              >
                <CaretRight
                  class="size-4 transition-transform"
                  classList={{
                    'rotate-90': isExpanded(),
                  }}
                />
              </button>
            </Show>
          </div>
        </div>
      </BaseTool>
    );
  },
});

export const listEntitiesHandler = handler;
