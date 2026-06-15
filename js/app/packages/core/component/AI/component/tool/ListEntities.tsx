import { EntityIcon } from '@core/component/EntityIcon';
import WideChannel from '@icon/wide-channel.svg';
import WideFileMd from '@icon/wide-file-md.svg';
import List from '@phosphor-icons/core/regular/list.svg';
import type { NamedTool } from '@service-cognition/generated/tools/tool';
import { useSplitLayout } from 'app/component/split-layout/layout';
import { createMemo, createSignal } from 'solid-js';
import { match } from 'ts-pattern';
import { VList } from 'virtua/solid';
import { BaseTool } from './BaseTool';
import { Tool } from './Tool';
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

  const getItemTitle = (item: ListEntitiesItem): string =>
    match(item)
      .with({ type: 'document' }, (i) => i.name || 'Document')
      .with({ type: 'aiChat' }, (i) => i.name || 'Chat')
      .with({ type: 'project' }, (i) => i.name || 'Project')
      .with({ type: 'email' }, (i) => i.subject || 'Email')
      .with({ type: 'channel' }, (i) => i.name || 'Channel')
      .otherwise(() => 'Item');

  const getItemIcon = (item: ListEntitiesItem) =>
    match(item)
      .with({ type: 'channel' }, () => <WideChannel class="size-4" />)
      .with({ type: 'document' }, () => <WideFileMd class="size-4" />)
      .with({ type: 'aiChat' }, () => (
        <EntityIcon targetType="chat" size="xs" theme="monochrome" />
      ))
      .with({ type: 'project' }, () => (
        <EntityIcon targetType="project" size="xs" theme="monochrome" />
      ))
      .with({ type: 'email' }, () => (
        <EntityIcon targetType="email" size="xs" theme="monochrome" />
      ))
      .otherwise(() => undefined);

  const { replaceOrInsertSplit } = useSplitLayout();

  const getClickHandler = (item: ListEntitiesItem) =>
    match(item)
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

  const itemHeight = 32;
  const maxHeight = 240;

  return (
    <Tool.List>
      <VList
        class="overscroll-contain"
        data={results()}
        bufferSize={itemHeight * 5}
        itemSize={itemHeight}
        style={{
          height: `${Math.min(results().length * itemHeight, maxHeight)}px`,
          contain: 'content',
        }}
      >
        {(item) => {
          const clickHandler = getClickHandler(item);

          return (
            <button
              type="button"
              class="block w-full text-left hover:bg-surface-hover"
              onClick={clickHandler}
            >
              <Tool.ListItem icon={getItemIcon(item)}>
                <div class="truncate text-xs text-ink">
                  {getItemTitle(item)}
                </div>
              </Tool.ListItem>
            </button>
          );
        }}
      </VList>
    </Tool.List>
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
        <div class="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden">
          <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <span class="min-w-0 truncate">
              Filter for{' '}
              <span class="text-ink">
                {ctx.tool.data.includeTypes
                  ? ctx.tool.data.includeTypes.join(', ')
                  : 'All'}
              </span>{' '}
              ordered by{' '}
              <span class="text-ink">
                {ctx.tool.data.sortBy?.split('_').join(' ') ?? 'default'}
              </span>
            </span>
          </div>
          <Tool.ResultToggle
            expanded={isExpanded()}
            onToggle={() => setIsExpanded((expanded) => !expanded)}
            showToggle={hasResults()}
            status={statusText()}
          />
        </div>
      </BaseTool>
    );
  },
});

export const listEntitiesHandler = handler;
