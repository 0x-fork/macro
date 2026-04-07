import { EntityIcon } from '@core/component/EntityIcon';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { unifiedListMarkdownTheme } from '@core/component/LexicalMarkdown/theme';
import { toast } from '@core/component/Toast/Toast';
import { itemToSafeName } from '@core/constant/allBlocks';
import { buildSimpleEntityUrl } from '@core/util/url';
import ArrowSquareOutIcon from '@icon/regular/arrow-square-out.svg';
import CheckIcon from '@icon/regular/check.svg';
import LinkIcon from '@icon/regular/link-simple.svg';
import SplitIcon from '@icon/regular/square-half.svg';
import { Show } from 'solid-js';

export async function showTaskCreatedToast(params: {
  documentId: string;
  taskTitle: string;
  taskContent: string;
  openTask: (options?: { preferNewSplit?: boolean }) => void;
}) {
  const TaskEntityIcon = (p: { class?: string }) => (
    <EntityIcon targetType="task" class={p.class} />
  );

  const url = buildSimpleEntityUrl({ type: 'task', id: params.documentId }, {});
  let linkCopied = false;

  try {
    await navigator.clipboard.writeText(url);
    linkCopied = true;
  } catch {
    toast.failure('Failed to copy link to clipboard');
  }

  toast.custom(
    {
      title:
        params.taskTitle ||
        itemToSafeName({ type: 'document', subType: { type: 'task' } }),
      icon: TaskEntityIcon,
      color: 'var(--color-task)',
      content: () => (
        <div class="text-xs text-ink-extra-muted line-clamp-2 mb-4">
          <StaticMarkdown
            markdown={params.taskContent}
            theme={unifiedListMarkdownTheme}
            singleLine
          />
          <Show when={linkCopied}>
            <div class="bg-hover/50 flex items-center gap-1 rounded-xs p-1">
              <CheckIcon class="size-3" />
              <span>Link copied to clipboard</span>
            </div>
          </Show>
        </div>
      ),
      actions: [
        {
          label: 'Open',
          icon: ArrowSquareOutIcon,
          onClick: () => params.openTask(),
        },
        {
          label: 'Open in New Split',
          icon: SplitIcon,
          onClick: () => params.openTask({ preferNewSplit: true }),
        },
        {
          label: 'Copy Link',
          icon: LinkIcon,
          onClick: () => {
            navigator.clipboard.writeText(url);
          },
        },
      ],
    },
    { duration: 5_000 }
  );
}
