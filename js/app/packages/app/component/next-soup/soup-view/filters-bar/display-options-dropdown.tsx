import { type Component, For, Show, createSignal } from 'solid-js';
import { Popover } from '@kobalte/core/popover';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import CheckIcon from '@icon/check.svg';
import SlidersIcon from '@icon/sliders.svg';
import EyeIcon from '@icon/eye.svg';
import CaretDownIcon from '@icon/caret-down.svg';
import type {
  SortOption,
  SystemSortOption,
} from '@app/component/next-soup/soup-view/sort-options';
import { Button, cn, Layer, Tooltip } from '@ui';
import { useSoup } from '../../soup-context';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { useAnalytics } from '@app/component/analytics-context';

export interface DisplayOptionsDropdownProps {
  sortValue: () => SystemSortOption;
  onSortChange: (value: SystemSortOption) => void;
  sortOptions: SortOption[];
}

export const DisplayOptionsDropdown: Component<DisplayOptionsDropdownProps> = (
  props
) => {
  const [open, setOpen] = createSignal(false);
  const soup = useSoup();
  const panel = useSplitPanelOrThrow();
  const analytics = useAnalytics();

  const isPreviewActive = () => !!soup.previewEntity();

  const togglePreview = () => {
    const currentPreview = soup.previewEntity();
    if (currentPreview) {
      soup.setPreviewEntity(undefined);
      return;
    }

    const focused = soup.focus.id();
    if (!focused) return;

    analytics.track('preview_panel_use');
    soup.setPreviewEntity(focused);
  };

  registerHotkey({
    hotkey: 's',
    scopeId: panel.splitHotkeyScope,
    description: 'Open display options',
    keyDownHandler: () => {
      setOpen(true);
      return true;
    },
  });

  registerHotkey({
    hotkey: 'space',
    scopeId: panel.splitHotkeyScope,
    description: 'Toggle preview',
    keyDownHandler: () => {
      togglePreview();
      return true;
    },
  });

  const currentSortLabel = () =>
    props.sortOptions.find((o) => o.value === props.sortValue())?.label ??
    'Updated';

  return (
    <Popover open={open()} onOpenChange={setOpen} placement="bottom-end" gutter={4}>
      <Tooltip label="Display options" shortcut="S">
        <Popover.Trigger
          as={Button}
          variant="base"
          size="sm"
          class="rounded-xs [&_svg]:size-4 p-1.5 aspect-square"
        >
          <SlidersIcon />
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Layer depth={2}>
          <Popover.Content class="z-action-menu bg-menu border border-edge-muted rounded-sm shadow-sm min-w-[180px] p-2 flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs text-ink-muted">Sort</span>
              <DropdownMenu placement="bottom-end" gutter={4}>
                <DropdownMenu.Trigger class="flex items-center gap-1 px-2 py-1 text-xs rounded-xs border border-edge-muted hover:bg-ink/5 transition-colors">
                  <span class="text-ink">{currentSortLabel()}</span>
                  <CaretDownIcon class="size-3 text-ink-muted" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <Layer depth={3}>
                    <DropdownMenu.Content class="z-action-menu bg-menu border border-edge-muted rounded-sm shadow-sm min-w-[140px] p-1">
                      <For each={props.sortOptions}>
                        {(option) => (
                          <DropdownMenu.Item
                            class="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-ink/5 focus:bg-ink/5 outline-none cursor-default rounded-sm"
                            onSelect={() => props.onSortChange(option.value)}
                          >
                            <span
                              class="flex-1 truncate"
                              classList={{
                                'text-ink font-medium':
                                  props.sortValue() === option.value,
                                'text-ink-muted':
                                  props.sortValue() !== option.value,
                              }}
                            >
                              {option.label}
                            </span>
                            <Show when={props.sortValue() === option.value}>
                              <CheckIcon class="size-3 text-accent shrink-0" />
                            </Show>
                          </DropdownMenu.Item>
                        )}
                      </For>
                    </DropdownMenu.Content>
                  </Layer>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </div>

            <div class="h-px bg-ink/5" />

            <button
              type="button"
              class="flex items-center gap-2 px-1 py-1 text-xs rounded-xs hover:bg-ink/5 transition-colors -mx-1"
              onClick={togglePreview}
            >
              <span
                class={cn(
                  'size-4 flex items-center justify-center rounded-xs border transition-colors',
                  isPreviewActive()
                    ? 'bg-accent border-accent'
                    : 'border-edge-muted'
                )}
              >
                <Show when={isPreviewActive()}>
                  <CheckIcon class="size-3 text-page" />
                </Show>
              </span>
              <EyeIcon class="size-3.5 shrink-0 text-ink-muted" />
              <span class="text-ink-muted">Preview</span>
            </button>
          </Popover.Content>
        </Layer>
      </Popover.Portal>
    </Popover>
  );
};
