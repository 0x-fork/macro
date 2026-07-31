import CaretDownIcon from '@phosphor-icons/core/assets/fill/caret-down-fill.svg';
import { makePersisted } from '@solid-primitives/storage';
import { cn } from '@ui';
import { createSignal, For, type JSX, onCleanup, Show } from 'solid-js';

export type CollapsibleSidebarSectionItem = {
  id: string;
  visible: () => JSX.Element;
  dropdown: () => JSX.Element;
};

export function CollapsibleSidebarSection(props: {
  label: string;
  items: readonly CollapsibleSidebarSectionItem[];
  /** Optional icon rendered before the header label. */
  icon?: JSX.Element;
  headerMenu?: () => JSX.Element;
  defaultOpen?: boolean;
  /** Persist the open state locally under this key. */
  persistKey?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  // With a `persistKey` the signal itself is persisted — the setter writes
  // through to local storage, so a refresh restores the toggled state.
  const [open, setOpen] =
    props.persistKey !== undefined
      ? makePersisted(createSignal(props.defaultOpen ?? true), {
          name: `sidebar-section-open:${props.persistKey}`,
        })
      : createSignal(props.defaultOpen ?? true);
  let openChangeTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (openChangeTimer !== undefined) clearTimeout(openChangeTimer);
  });

  const toggleOpen = () => {
    const next = !open();
    setOpen(next);
    props.onOpenChange?.(next);
    if (openChangeTimer !== undefined) clearTimeout(openChangeTimer);
    openChangeTimer = setTimeout(() => {
      openChangeTimer = undefined;
      props.onOpenChange?.(next);
    }, 130);
  };

  return (
    <section class="w-full flex flex-col">
      <header class="group/section relative">
        <button
          type="button"
          class={cn(
            'flex h-7 w-full min-w-0 items-center justify-start gap-2 rounded-md px-2 text-left text-[13px] font-medium text-ink-extra-muted transition-colors group-hover/section:bg-ink/3 group-hover/section:text-ink',
            // Reserve space for the hover menu only when one exists, so the
            // right-aligned caret can reach the edge otherwise.
            props.headerMenu && 'pr-9'
          )}
          aria-expanded={open()}
          onClick={toggleOpen}
        >
          {/* Same 20px box + 14px glyph as the nav rows' icons, so section
              icons line up with the link icons above. */}
          <Show when={props.icon}>
            <span class="size-5 shrink-0 flex items-center justify-center [&_svg]:size-3.5 opacity-75 transition-opacity group-hover/section:opacity-100">
              {props.icon}
            </span>
          </Show>
          <span class="min-w-0 truncate">{props.label}</span>
          <CaretDownIcon
            class={cn(
              'ml-auto size-3 shrink-0 text-ink-extra-muted/60 transition-[transform,color] duration-[120ms] ease-in-out group-hover/section:text-ink-muted',
              !open() && '-rotate-90'
            )}
          />
        </button>
        <Show when={props.headerMenu}>
          {(headerMenu) => (
            <div class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
              {headerMenu()()}
            </div>
          )}
        </Show>
      </header>
      <div
        class={cn('grid overflow-hidden', !open() && 'pointer-events-none')}
        aria-hidden={!open()}
        style={{
          'grid-template-rows': open() ? '1fr' : '0fr',
          'margin-top': open() ? '0.125rem' : '0',
          opacity: open() ? '1' : '0',
          visibility: open() ? 'visible' : 'hidden',
          transition: open()
            ? 'grid-template-rows 120ms ease-in-out, margin-top 120ms ease-in-out, opacity 120ms ease-in-out, visibility 0ms linear 0ms'
            : 'grid-template-rows 120ms ease-in-out, margin-top 120ms ease-in-out, opacity 120ms ease-in-out, visibility 0ms linear 120ms',
        }}
      >
        <div class="min-h-0 overflow-hidden flex flex-col gap-0.5 pl-3">
          <For each={props.items}>
            {(item) => <div class="w-full">{item.visible()}</div>}
          </For>
        </div>
      </div>
    </section>
  );
}
