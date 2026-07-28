import { SUPPORTED_CHAT_ATTACHMENT_BLOCKS } from '@core/component/AI/constant/fileType';
import { getItemBlockName } from '@core/util/getItemBlockName';
import type { HistoryItem } from '@queries/history/history';
import { useHistoryQuery } from '@queries/history/history';
import { createEffect, createMemo, createSignal, Suspense } from 'solid-js';

// ---- Global signals ----

const [globalAttachableHistory, setGlobalAttachableHistory] = createSignal<
  HistoryItem[]
>([]);

const [globalSkillHistory, setGlobalSkillHistory] = createSignal<HistoryItem[]>(
  []
);

export { globalAttachableHistory, globalSkillHistory };

// ---- Init component (mount once at app root) ----

function GlobalAttachmentsInner() {
  const historyQuery = useHistoryQuery();

  const attachableHistory = createMemo(() => {
    return (historyQuery.data ?? []).filter((item) => {
      const blockName = getItemBlockName(item, true);
      return SUPPORTED_CHAT_ATTACHMENT_BLOCKS.includes(blockName);
    });
  });

  const skillHistory = createMemo(() => {
    return (historyQuery.data ?? []).filter(
      (item) => getItemBlockName(item, true) === 'skill'
    );
  });

  createEffect(() => {
    setGlobalAttachableHistory(attachableHistory());
  });

  createEffect(() => {
    setGlobalSkillHistory(skillHistory());
  });

  return null;
}

export function ChatAttachmentsInit() {
  return (
    <Suspense>
      <GlobalAttachmentsInner />
    </Suspense>
  );
}
