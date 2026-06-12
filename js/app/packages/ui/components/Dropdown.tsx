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

// const DROPDOWN_CONTENT_CLASS = 'z-action-menu bg-surface rounded-lg ring-1 ring-edge shadow-[0_8px_24px_-16px_rgba(0,0,0,0.24),0_2px_8px_-6px_rgba(0,0,0,0.18)] p-1.5';
// const DROPDOWN_ITEM_CLASS = 'rounded-lg hover:bg-ink/3 focus:bg-ink/3 data-[highlighted]:bg-ink/3';

type PortalMount = ComponentProps<typeof KobalteDropdownMenu.Portal>['mount'];
type DropdownPortalScope = 'local';

export type DropdownSubContentProps = ComponentProps<
  typeof KobalteDropdownMenu.SubContent
> & {
  depth?: SurfaceProps['depth'];
  mount?: PortalMount;
  portalScope?: DropdownPortalScope;
};
export type DropdownContentProps = ComponentProps<
  typeof KobalteDropdownMenu.Content
> & {
  depth?: SurfaceProps['depth'];
  mount?: PortalMount;
  portalScope?: DropdownPortalScope;
};
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
export type DropdownSeparatorProps = ComponentProps<
  typeof KobalteDropdownMenu.Separator
>;

const ROW_CLASS = cn(
  'menu-item group flex w-full items-center gap-2.5 rounded-lg py-1.5 pl-2 pr-4',
  'cursor-default text-left text-sm font-medium outline-none',
  'text-ink/65 hover:text-ink data-highlighted:text-ink',
  'hover:bg-ink/3 data-highlighted:bg-ink/3',
  'hover:shadow-[inset_0_0_0_1px_var(--color-edge-muted)]',
  'data-highlighted:shadow-[inset_0_0_0_1px_var(--color-edge-muted)]',
  'data-disabled:cursor-not-allowed',
  'data-disabled:text-ink-disabled/55 data-disabled:hover:text-ink-disabled/55',
  'data-disabled:data-[highlighted]:text-ink-disabled/55',
  'data-disabled:bg-transparent data-disabled:hover:bg-transparent',
  'data-disabled:data-[highlighted]:bg-transparent',
  'data-disabled:shadow-none data-disabled:hover:shadow-none',
  'data-disabled:data-[highlighted]:shadow-none'
);
const CONTENT_CLASS = cn(
  'menu-content flex flex-col justify-start items-start bg-surface rounded-xl',
  'px-1 py-1.25 cursor-default select-none',
  'max-w-full max-h-[calc(100dvh-10rem)] overflow-y-auto',
  'z-action-menu menu-open-animation',
  'shadow-[inset_0_0_0_1px_var(--color-edge-muted),inset_0_2px_0_0_color-mix(in_oklch,var(--color-edge-muted)_85%,white),0_10px_28px_-18px_rgba(0,0,0,0.28),0_2px_8px_-6px_rgba(0,0,0,0.18)]'
);

function resolvePortalMount(
  searchRef: HTMLElement | undefined,
  mount: PortalMount,
  portalScope: DropdownPortalScope | undefined
): PortalMount {
  if (mount || portalScope !== 'local') return mount;
  return searchRef?.closest<HTMLElement>('.portal-scope') ?? undefined;
}

function DropdownContent(props: DropdownContentProps) {
  let searchRef: HTMLDivElement | undefined;
  const [local, rest] = splitProps(props, ['depth', 'class', 'mount', 'portalScope', 'children', 'style']);
  return (
    <>
      <div class="hidden" ref={searchRef} />
      <KobalteDropdownMenu.Portal
        mount={resolvePortalMount(searchRef, local.mount, local.portalScope)}
      >
        <KobalteDropdownMenu.Content
          class={cn(CONTENT_CLASS, local.class)}
          depth={local.depth ?? 2}
          as={Surface}
          style={{
            'background-image': 'linear-gradient(var(--b0), var(--b0))',
            border: '0',
            ...(typeof local.style === 'object' ? local.style : {}),
          }}
          {...rest}
        >
          {local.children}
        </KobalteDropdownMenu.Content>
      </KobalteDropdownMenu.Portal>
    </>
  );
}

function DropdownSubContent(props: DropdownSubContentProps) {
  let searchRef: HTMLDivElement | undefined;
  const [local, rest] = splitProps(props, ['depth', 'class', 'mount', 'portalScope', 'children', 'style']);
  return (
    <>
      <div class="hidden" ref={searchRef} />
      <KobalteDropdownMenu.Portal
        mount={resolvePortalMount(searchRef, local.mount, local.portalScope)}
      >
        <KobalteDropdownMenu.SubContent
          class={cn(CONTENT_CLASS, local.class)}
          depth={local.depth ?? 2}
          as={Surface}
          style={{
            'background-image': 'linear-gradient(var(--b0), var(--b0))',
            border: '0',
            ...(typeof local.style === 'object' ? local.style : {}),
          }}
          {...rest}
        >
          {local.children}
        </KobalteDropdownMenu.SubContent>
      </KobalteDropdownMenu.Portal>
    </>
  );
}

function DropdownGroup(props: DropdownGroupProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteDropdownMenu.Group
      class={cn(
        'menu-group flex w-full flex-col',
        local.class
      )}
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

function DropdownSeparator(props: DropdownSeparatorProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteDropdownMenu.Separator
      class={cn('menu-separator my-1 border-edge border-t w-full', local.class)}
      {...rest}
    />
  );
}

function DropdownItem(props: DropdownItemProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteDropdownMenu.Item
      class={cn(ROW_CLASS, local.class)}
      closeOnSelect={props.closeOnSelect ?? true}
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
    Separator: DropdownSeparator,
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
