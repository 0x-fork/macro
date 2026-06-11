import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import type { ListView } from '@app/constants/list-views';
import { isListViewID } from '@app/constants/list-views';
import { EntityIcon } from '@core/component/EntityIcon';
import StatusInProgress from '@icon/task-in-progress-circle-pie.svg';
import PriorityHigh from '@icon/wide-priority-high.svg';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import CalendarIcon from '@phosphor/calendar-blank.svg';
import CheckIcon from '@phosphor/check.svg';
import CaretDownIcon from '@phosphor/caret-down.svg';
import PaperclipIcon from '@phosphor/paperclip.svg';
import TagIcon from '@phosphor/tag.svg';
import { cn, Layer } from '@ui';
import { createMemo, createSignal, For, Show } from 'solid-js';
import {
  VIEW_FILTER_CATEGORIES,
  type FilterCategory,
  type FilterOption,
} from './unified-filter-dropdown';

type SuggestedFilterCategory = FilterCategory;

type SuggestedFiltersProps = {
  suggestions: SuggestedFilterCategory[];
  onAdd: (optionId: string) => void;
  isOptionActive: (optionId: string) => boolean;
  class?: string;
};

const SUGGESTED_CATEGORY_IDS_BY_VIEW: Partial<Record<ListView, string[]>> = {
  inbox: ['type'],
  mail: ['status', 'attachment', 'calendar'],
  documents: ['type'],
  tasks: ['status', 'priority'],
};

const hasActiveOption = (
  category: FilterCategory,
  isOptionActive: (optionId: string) => boolean
) => category.options.some((option) => isOptionActive(option.id));

const findSuggestedCategories = (
  view: ListView,
  isOptionActive: (optionId: string) => boolean
): SuggestedFilterCategory[] => {
  const suggestedIds = SUGGESTED_CATEGORY_IDS_BY_VIEW[view] ?? [];
  const categories = VIEW_FILTER_CATEGORIES[view] ?? [];

  return suggestedIds
    .map((id) => categories.find((category) => category.id === id))
    .filter((category): category is FilterCategory => !!category)
    .filter((category) => !hasActiveOption(category, isOptionActive));
};

export const useSoupViewSuggestedFilters = (props: {
  isOptionActive: (optionId: string) => boolean;
}) => {
  const panel = useSplitPanelOrThrow();

  const currentView = createMemo(() => {
    const content = panel.handle.content();
    if (content.type !== 'component' || !isListViewID(content.id)) return;
    return content.id;
  });

  return createMemo(() => {
    const view = currentView();
    if (!view) return [];
    return findSuggestedCategories(view, props.isOptionActive);
  });
};

const SuggestedOptionIcon = (props: { option: FilterOption }) => (
  <Show when={props.option.icon}>
    {(icon) => (
      <span class="size-3.5 flex items-center justify-center shrink-0 text-ink/55 [&>*]:size-3 [&_svg]:size-3">
        {icon()()}
      </span>
    )}
  </Show>
);

const SUGGESTED_CATEGORY_ICON_CLASS = 'size-3 text-ink/35 shrink-0';

const SuggestedCategoryIcon = (props: { category: SuggestedFilterCategory }) => {
  const icon = () => {
    switch (props.category.id) {
      case 'status':
        return <StatusInProgress class={SUGGESTED_CATEGORY_ICON_CLASS} />;
      case 'priority':
        return <PriorityHigh class={SUGGESTED_CATEGORY_ICON_CLASS} />;
      case 'attachment':
        return <PaperclipIcon class={SUGGESTED_CATEGORY_ICON_CLASS} />;
      case 'calendar':
        return <CalendarIcon class={SUGGESTED_CATEGORY_ICON_CLASS} />;
      case 'type':
        return props.category.options.some((option) => option.id.startsWith('doc-') || option.id.startsWith('file-')) ? (
          <EntityIcon targetType="md" size="xs" />
        ) : (
          <TagIcon class={SUGGESTED_CATEGORY_ICON_CLASS} />
        );
      default:
        return <TagIcon class={SUGGESTED_CATEGORY_ICON_CLASS} />;
    }
  };

  return <span class="size-3.5 flex items-center justify-center shrink-0 [&>*]:size-3 [&_svg]:size-3">{icon()}</span>;
};

const SuggestedFilterPill = (props: {
  category: SuggestedFilterCategory;
  onAdd: (optionId: string) => void;
  isOptionActive: (optionId: string) => boolean;
}) => {
  const [open, setOpen] = createSignal(false);

  return (
    <DropdownMenu open={open()} onOpenChange={setOpen} gutter={4}>
      <DropdownMenu.Trigger
        class={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-dashed border-edge-muted px-2 py-0.5 text-xs font-medium',
          'bg-transparent text-ink/45 hover:text-ink hover:border-edge hover:bg-ink/3 transition-colors outline-none'
        )}
      >
        <SuggestedCategoryIcon category={props.category} />
        <span>{props.category.label}</span>
        <CaretDownIcon class="size-3 text-ink/35 shrink-0" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <Layer depth={2}>
          <DropdownMenu.Content class="z-action-menu bg-surface rounded-xl border-0 min-w-[180px] p-1 shadow-[inset_0_0_0_1px_var(--color-edge-muted),inset_0_2px_0_0_color-mix(in_oklch,var(--color-edge-muted)_85%,white),0_10px_28px_-18px_rgba(0,0,0,0.28),0_2px_8px_-6px_rgba(0,0,0,0.18)]">
            <For each={props.category.options}>
              {(option) => {
                const active = () => props.isOptionActive(option.id);
                return (
                  <DropdownMenu.Item
                    class="w-full flex items-center gap-2.5 py-1.5 pl-2 pr-4 rounded-lg text-left text-sm font-medium transition-colors text-ink/65 hover:text-ink data-highlighted:text-ink hover:bg-ink/3 data-highlighted:bg-ink/3 hover:shadow-[inset_0_0_0_1px_var(--color-edge-muted)] data-highlighted:shadow-[inset_0_0_0_1px_var(--color-edge-muted)] outline-none cursor-default"
                    onSelect={() => {
                      if (!active()) props.onAdd(option.id);
                      queueMicrotask(() => setOpen(true));
                    }}
                  >
                    <SuggestedOptionIcon option={option} />
                    <span class="flex-1 truncate">{option.label}</span>
                    <Show when={active()}>
                      <CheckIcon class="size-3 text-accent shrink-0" />
                    </Show>
                  </DropdownMenu.Item>
                );
              }}
            </For>
          </DropdownMenu.Content>
        </Layer>
      </DropdownMenu.Portal>
    </DropdownMenu>
  );
};

export const SuggestedFilterChips = (props: SuggestedFiltersProps) => (
  <Show when={props.suggestions.length > 0}>
    <div class={cn('flex items-center gap-1.5 flex-wrap', props.class)}>
      <For each={props.suggestions}>
        {(category) => (
          <SuggestedFilterPill
            category={category}
            onAdd={props.onAdd}
            isOptionActive={props.isOptionActive}
          />
        )}
      </For>
    </div>
  </Show>
);
