import { CREATE_MENU_COMMAND_SCOPE } from '@app/constants/hotkeys';
import { CREATABLE_BLOCKS } from '@app/features/command/Launcher';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { useHotkeyInterceptor } from '@app/signal/hotkeyRoot';
import { getIconConfig } from '@core/component/EntityIcon';
import {
  ENABLE_SNIPPETS_FLAG,
  ENABLE_SNIPPETS_OVERRIDE,
} from '@core/constant/featureFlags';
import { setActiveScope } from '@core/hotkey/state';
import { TOKENS } from '@core/hotkey/tokens';
import { activateClosestDOMScope } from '@core/hotkey/utils';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import CreateIcon from '@icon/square-pen-create.svg';
import PlusIcon from '@phosphor/plus.svg';
import { Button, cn, Dropdown, Hotkey, NavRow } from '@ui';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { CreateMenuExplainer } from './create-menu-explainer';

export const SidebarCreateMenu = (props: {
  isSlim: () => boolean;
  variant?: 'row' | 'icon';
  onMenuOpenChange?: (open: boolean) => void;
}) => {
  const analytics = useAnalytics();
  const [open, setOpen] = createSignal(false);
  const [focusedIndex, setFocusedIndex] = createSignal(-1);
  // The row the explainer panel points at. Tracked alongside `focusedIndex`
  // rather than derived from it so the panel can anchor to the real element,
  // whether it became active by pointer or by keyboard.
  const [focusedRow, setFocusedRow] = createSignal<HTMLElement>();
  const snippetsFlag = useFeatureFlag(ENABLE_SNIPPETS_FLAG, {
    enabledOverride: ENABLE_SNIPPETS_OVERRIDE,
  });

  const blocks = createMemo(() =>
    CREATABLE_BLOCKS.filter(
      (block) => block.blockName !== 'snippet' || snippetsFlag().enabled
    )
  );

  const focusedBlock = createMemo(() => blocks()[focusedIndex()]);

  const focusRow = (index: number, row: HTMLElement | undefined) => {
    setFocusedIndex(index);
    setFocusedRow(row);
  };

  const clearFocusedRow = () => {
    setFocusedIndex(-1);
    setFocusedRow(undefined);
  };

  // Closing also happens outside `handleOpenChange` — the hotkey interceptor and
  // `onSelect` call `setOpen(false)` directly — so drop the focused row from the
  // open state itself. Otherwise reopening would briefly anchor the explainer to
  // the previous row's now-detached element.
  createEffect(() => {
    if (!open()) clearFocusedRow();
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && !open()) {
      analytics.track('create_menu_open', { from: 'sidebar' });
    }
    setOpen(nextOpen);
    props.onMenuOpenChange?.(nextOpen);
    if (nextOpen) {
      setActiveScope(CREATE_MENU_COMMAND_SCOPE);
    } else {
      activateClosestDOMScope();
    }
  };

  onCleanup(() => props.onMenuOpenChange?.(false));

  useHotkeyInterceptor((context) => {
    if (!open() || context.eventType !== 'keydown') return false;

    if (
      context.pressedKeysString === 'c' ||
      context.pressedKeysString === 'escape'
    ) {
      setOpen(false);
      activateClosestDOMScope();
      return true;
    }

    const matchingBlock = blocks().find((block) => {
      const shiftedHotkey = `shift+${block.hotkey}`;
      return (
        context.pressedKeysString === block.hotkey ||
        context.pressedKeysString === shiftedHotkey
      );
    });

    if (!matchingBlock) return false;

    setOpen(false);
    matchingBlock.keyDownHandler?.(context.event);
    activateClosestDOMScope();
    return true;
  });

  return (
    <Dropdown
      open={open()}
      onOpenChange={handleOpenChange}
      placement="right-start"
      gutter={8}
    >
      <Show
        when={props.variant === 'icon'}
        fallback={
          <Dropdown.Trigger
            as={NavRow}
            class="center h-8 bg-ink/4 text-[13px]"
            fullWidth
            tooltipPlacement="right"
            tooltipDisabled={!props.isSlim()}
            label="Create"
            hotkey={TOKENS.global.createCommand}
            onMouseDown={(e: MouseEvent) => {
              if (e.button !== 0) return;
              e.preventDefault();
            }}
          >
            <div class="size-4 shrink-0">
              <PlusIcon class="size-4" />
            </div>
            <span class="whitespace-nowrap group-data-[slim=true]/sidebar:hidden">
              Create
            </span>
            <Show when={open()}>
              <div class="text-xxs text-ink-extra-muted/50 rounded-sm ml-auto border border-ink/5 px-1.5 py-px -my-1 group-data-[slim=true]/sidebar:hidden">
                <Hotkey
                  token={TOKENS.global.createCommand}
                  class="flex gap-1"
                />
              </div>
            </Show>
          </Dropdown.Trigger>
        }
      >
        <Dropdown.Trigger
          as={Button}
          variant="base"
          size="icon-sm"
          depth={1}
          class="size-[26px] rounded-full bg-surface shadow-md shadow-drop-shadow [&_svg]:size-4!"
          label="Create"
          hotkey={TOKENS.global.createCommand}
          onMouseDown={(e: MouseEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();
          }}
        >
          <CreateIcon />
        </Dropdown.Trigger>
      </Show>
      <Dropdown.Content class="min-w-52 shadow-menu">
        <Dropdown.Group onMouseLeave={clearFocusedRow}>
          <For each={blocks()}>
            {(block, index) => {
              const iconConfig = getIconConfig(block.blockName);
              // Captured per row so the explainer can anchor to this element
              // without indexing into a shared array that goes stale when the
              // list changes (the snippets flag adds/removes an item).
              let row: HTMLElement | undefined;

              return (
                <Dropdown.Item
                  ref={(el: HTMLElement) => {
                    row = el;
                  }}
                  class="min-h-9 gap-2 px-2.5"
                  onFocus={() => focusRow(index(), row)}
                  onMouseEnter={() => focusRow(index(), row)}
                  onSelect={() => {
                    setOpen(false);
                    block.keyDownHandler();
                  }}
                >
                  <div
                    class={cn(
                      'size-4 shrink-0 flex items-center rounded-sm [&_svg]:size-4',
                      iconConfig.foreground
                    )}
                  >
                    <Dynamic
                      component={block.animatedIcon ?? block.icon}
                      triggerAnimation={focusedIndex() === index()}
                    />
                  </div>
                  <span class="flex-1 text-ink">{block.label}</span>
                  <Hotkey
                    token={block.hotkeyToken}
                    theme="subtle"
                    class="ml-6"
                  />
                </Dropdown.Item>
              );
            }}
          </For>
        </Dropdown.Group>
        {/* Hover-driven, so pointer-only — there is nothing to hover on touch. */}
        <Show when={!isTouchDevice()}>
          <CreateMenuExplainer anchor={focusedRow()} block={focusedBlock()} />
        </Show>
      </Dropdown.Content>
    </Dropdown>
  );
};
