import { DropdownMenu as KobalteDropdownMenu } from '@kobalte/core/dropdown-menu';
import CheckIcon from '@phosphor/check.svg';
import { type ComponentProps, splitProps } from 'solid-js';
import { cn } from '../utils/classname';
import { Button, type ButtonProps } from './Button';
import { Surface, type SurfaceProps } from './Surface';

/*
<Dropdown>
  <Dropdown.Trigger>Filter</Dropdown.Trigger>
  <Dropdown.Content>
    <Dropdown.Group>
      <Dropdown.Item></Dropdown.Item>
    </Dropdown.Group>
  </Dropdown.Content>
</Dropdown>
*/

/*
// Kobalte's "grace polygon" keeps an open sub alive when the
// pointer crosses toward its content. For sibling In/From triggers,
// that means moving between them leaves the prior sub stuck open
// and the prior trigger stuck with data-highlighted. Force focus
// + open so Kobalte's parent selection manager updates to this
// trigger and the shared signal closes the sibling.
*/

// const DROPDOWN_CONTENT_CLASS = 'z-action-menu bg-surface rounded-xl ring-1 ring-edge shadow-[0_8px_24px_-16px_rgba(0,0,0,0.24),0_2px_8px_-6px_rgba(0,0,0,0.18)] p-1.5';
// const DROPDOWN_ITEM_CLASS = 'rounded-md hover:bg-ink/3 focus:bg-ink/3 data-[highlighted]:bg-ink/3';

type PortalMount = ComponentProps<typeof KobalteDropdownMenu.Portal>['mount'];
type DropdownPortalScope = 'local';

/**
 * `autoHighlightFirst`: opt in to "first row highlighted on open, and one row always
 * highlighted while open". Off by default; enable per menu where it fits (e.g. filter menus).
 * See {@link attachAutoHighlightFirst} for how it works and its caveats.
 */
type AutoHighlightProp = { autoHighlightFirst?: boolean };

export type DropdownSubContentProps = ComponentProps<
  typeof KobalteDropdownMenu.SubContent
> & {
  depth?: SurfaceProps['depth'];
  mount?: PortalMount;
  portalScope?: DropdownPortalScope;
} & AutoHighlightProp;
export type DropdownContentProps = ComponentProps<
  typeof KobalteDropdownMenu.Content
> & {
  depth?: SurfaceProps['depth'];
  mount?: PortalMount;
  portalScope?: DropdownPortalScope;
} & AutoHighlightProp;
export type DropdownTriggerProps = ComponentProps<
  typeof KobalteDropdownMenu.Trigger
> &
  ButtonProps;
export type DropdownItemIndicatorProps = ComponentProps<
  typeof KobalteDropdownMenu.ItemIndicator
>;
export type DropdownCheckboxItemProps = ComponentProps<
  typeof KobalteDropdownMenu.CheckboxItem
>;
export type DropdownSubTriggerProps = ComponentProps<
  typeof KobalteDropdownMenu.SubTrigger
>;
export type DropdownRadioItemProps = ComponentProps<
  typeof KobalteDropdownMenu.RadioItem
>;
export type DropdownGroupLabelProps = ComponentProps<
  typeof KobalteDropdownMenu.GroupLabel
>;
export type DropdownGroupProps = ComponentProps<
  typeof KobalteDropdownMenu.Group
>;
export type DropdownItemProps = ComponentProps<typeof KobalteDropdownMenu.Item>;
export type DropdownSubProps = ComponentProps<typeof KobalteDropdownMenu.Sub>;

const ROW_CLASS =
  'group rounded-lg w-full flex items-center gap-2 px-2 h-8 text-left font-medium text-xs cursor-default outline-none hover:bg-ink/5 data-highlighted:bg-ink/5 data-disabled:opacity-50 data-disabled:cursor-not-allowed';

const MENU_ITEM_SELECTOR =
  '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]';

/**
 * Keeps one row highlighted while a menu (content or sub-content) is open. Kobalte's menu
 * context — which owns the highlighted key — isn't publicly exported, so we use the public
 * lever: DOM focus. Focusing a menu item fires its onFocus, which sets the highlighted key;
 * crucially, that key survives the item losing DOM focus (the menu's onFocusOut only flips an
 * "is focused" flag, it doesn't clear the key), so the highlight sticks even when focus moves
 * elsewhere. The listener/handlers live on the content element, which Kobalte discards when the
 * menu closes, so they need no explicit teardown.
 *
 * Top-level menu: opens focused on its *container* (no row highlighted), and focus returns to
 * the container whenever the pointer leaves a row. We listen for focus landing on the container
 * and redirect it to the first row. Caveat: that means the highlight snaps back to the *first*
 * row on mouse-away rather than staying on the last-hovered row.
 */
function attachAutoHighlightFirst(content: HTMLElement) {
  const focusFirstRow = () => {
    // Leave an existing highlight alone — hover or arrow keys already chose a row.
    if (content.querySelector('[data-highlighted]')) return;
    content
      .querySelector<HTMLElement>(MENU_ITEM_SELECTOR)
      ?.focus({ preventScroll: true });
  };
  content.addEventListener('focusin', (e) => {
    if (e.target === content) focusFirstRow();
  });
  requestAnimationFrame(focusFirstRow);
}

/**
 * Sub-content variant. A sub-menu opened by hover never receives focus — Kobalte keeps it on
 * the parent trigger — so the focusin path never fires; we seed the first row after one frame
 * (the frame lets Kobalte's DismissableLayer register, so moving focus in isn't read as "focus
 * outside" and doesn't close the menu). But focusing the row also flags the sub-menu "focused",
 * and the parent SubTrigger's onPointerMove clears the highlighted key whenever it sees that
 * flag set — so the highlight would vanish the instant the cursor moves over the parent. To
 * avoid that, we focus the row to set the key, then immediately restore focus to wherever it was
 * (the trigger). The key persists (onFocusOut doesn't clear it) and, with the sub-menu no longer
 * "focused", the SubTrigger leaves it alone — so the highlight survives the cursor sitting on
 * the parent.
 */
function attachAutoHighlightFirstSub(content: HTMLElement) {
  // Capture the opener (the trigger that opened this sub-menu) *now*, before deferring — by the
  // time the frame runs the pointer may have slid to a sibling trigger.
  const opener = document.activeElement as HTMLElement | null;
  requestAnimationFrame(() => {
    if (content.querySelector('[data-highlighted]')) return;
    // If focus already moved on (pointer slid to a sibling trigger), bail rather than fight it:
    // focusing+restoring here would thrash focus across two triggers and can leave both rows
    // highlighted. The sibling's own sub-menu will seed itself when it opens.
    if (document.activeElement !== opener) return;
    const first = content.querySelector<HTMLElement>(MENU_ITEM_SELECTOR);
    if (!first) return;
    first.focus({ preventScroll: true });
    if (opener && opener !== first && opener.isConnected) {
      opener.focus({ preventScroll: true });
    }
  });
}

function resolvePortalMount(
  searchRef: HTMLElement | undefined,
  mount: PortalMount,
  portalScope: DropdownPortalScope | undefined
): PortalMount {
  if (mount || portalScope !== 'local') return mount;
  return searchRef?.closest<HTMLElement>('.portal-scope') ?? undefined;
}

// Composes an optional user-supplied ref with the auto-highlight wiring, so passing
// `autoHighlightFirst` doesn't clobber a `ref` on the same content. Sub-content needs the
// focus-restoring variant (see attachAutoHighlightFirstSub).
function composeContentRef(
  autoHighlightFirst: boolean | undefined,
  isSubContent: boolean,
  userRef: unknown
) {
  return (el: HTMLElement) => {
    if (autoHighlightFirst) {
      if (isSubContent) attachAutoHighlightFirstSub(el);
      else attachAutoHighlightFirst(el);
    }
    if (typeof userRef === 'function')
      (userRef as (el: HTMLElement) => void)(el);
  };
}

function DropdownContent(props: DropdownContentProps) {
  let searchRef: HTMLDivElement | undefined;
  const [local, rest] = splitProps(props, [
    'depth',
    'class',
    'mount',
    'portalScope',
    'children',
    'autoHighlightFirst',
    'ref',
  ]);
  return (
    <>
      <div class="hidden" ref={searchRef} />
      <KobalteDropdownMenu.Portal
        mount={resolvePortalMount(searchRef, local.mount, local.portalScope)}
      >
        <KobalteDropdownMenu.Content
          ref={composeContentRef(local.autoHighlightFirst, false, local.ref)}
          class={cn('rounded-xl size-auto z-action-menu', local.class)}
          depth={local.depth ?? 2}
          as={Surface}
          {...rest}
        >
          <div class="flex flex-col gap-px bg-edge-muted size-full">
            {local.children}
          </div>
        </KobalteDropdownMenu.Content>
      </KobalteDropdownMenu.Portal>
    </>
  );
}

function DropdownSubContent(props: DropdownSubContentProps) {
  let searchRef: HTMLDivElement | undefined;
  const [local, rest] = splitProps(props, [
    'depth',
    'class',
    'mount',
    'portalScope',
    'children',
    'autoHighlightFirst',
    'ref',
  ]);
  return (
    <>
      <div class="hidden" ref={searchRef} />
      <KobalteDropdownMenu.Portal
        mount={resolvePortalMount(searchRef, local.mount, local.portalScope)}
      >
        <KobalteDropdownMenu.SubContent
          ref={composeContentRef(local.autoHighlightFirst, true, local.ref)}
          class={cn('rounded-xl size-auto z-action-menu', local.class)}
          depth={local.depth ?? 2}
          as={Surface}
          {...rest}
        >
          <div class="flex flex-col gap-px bg-edge-muted size-full">
            {local.children}
          </div>
        </KobalteDropdownMenu.SubContent>
      </KobalteDropdownMenu.Portal>
    </>
  );
}

function DropdownGroup(props: DropdownGroupProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteDropdownMenu.Group
      class={cn('flex flex-col p-1.5 gap-0.5 bg-surface', local.class)}
      {...rest}
    />
  );
}

function DropdownGroupLabel(props: DropdownGroupLabelProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteDropdownMenu.GroupLabel
      class={cn(
        'px-2 h-7 flex items-center text-xs text-ink-extra-muted',
        local.class
      )}
      {...rest}
    />
  );
}

const CHECKBOX_ITEM_BOX_CLASS = cn(
  'inline-flex items-center justify-center size-3.5 shrink-0 rounded-sm',
  'border border-transparent text-surface',
  'group-hover:not-hover:border-edge-muted group-data-highlighted:not-hover:border-edge-muted',
  'hover:border-accent',
  'group-data-checked:bg-accent group-data-checked:border-accent'
);

function DropdownCheckboxItem(props: DropdownCheckboxItemProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <KobalteDropdownMenu.CheckboxItem
      class={cn(ROW_CLASS, local.class)}
      {...rest}
    >
      <div class={CHECKBOX_ITEM_BOX_CLASS}>
        <KobalteDropdownMenu.ItemIndicator>
          <CheckIcon class="size-2.5" />
        </KobalteDropdownMenu.ItemIndicator>
      </div>
      {local.children}
    </KobalteDropdownMenu.CheckboxItem>
  );
}

function DropdownItemIndicator(props: DropdownItemIndicatorProps) {
  return <KobalteDropdownMenu.ItemIndicator {...props} />;
}

function DropdownSubTrigger(props: DropdownSubTriggerProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteDropdownMenu.SubTrigger
      class={cn(ROW_CLASS, 'justify-between', local.class)}
      {...rest}
    />
  );
}

function DropdownRadioItem(props: DropdownRadioItemProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteDropdownMenu.RadioItem
      class={cn(ROW_CLASS, local.class)}
      {...rest}
    />
  );
}

function DropdownSub(props: DropdownSubProps) {
  return <KobalteDropdownMenu.Sub gutter={2} shift={-7} {...props} />;
}

function DropdownItem(props: DropdownItemProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteDropdownMenu.Item
      class={cn(ROW_CLASS, local.class)}
      closeOnSelect={props.closeOnSelect}
      {...rest}
    />
  );
}

function DropdownTrigger(props: DropdownTriggerProps) {
  return (
    <KobalteDropdownMenu.Trigger
      variant="base"
      as={Button}
      size="sm"
      {...props}
    />
  );
}

export const Dropdown = Object.assign(
  (props: ComponentProps<typeof KobalteDropdownMenu>) => (
    <KobalteDropdownMenu gutter={4} {...props} />
  ),
  {
    RadioGroup:
      KobalteDropdownMenu.RadioGroup /* passthrough — pure logical wrapper */,
    Separator:
      KobalteDropdownMenu.Separator /* passthrough — styled via class at use sites */,
    ItemIndicator: DropdownItemIndicator,
    CheckboxItem: DropdownCheckboxItem,
    SubContent: DropdownSubContent,
    SubTrigger: DropdownSubTrigger,
    GroupLabel: DropdownGroupLabel,
    RadioItem: DropdownRadioItem,
    Content: DropdownContent,
    Trigger: DropdownTrigger,
    Group: DropdownGroup,
    Item: DropdownItem,
    Sub: DropdownSub,
  }
);
