import { Select as KobalteSelect } from '@kobalte/core/select';
import CaretDownIcon from '@phosphor/caret-down.svg';
import CheckIcon from '@phosphor/check.svg';
import {
  type ComponentProps,
  createContext,
  onCleanup,
  splitProps,
  useContext,
} from 'solid-js';
import { cn } from '../utils/classname';
import { addCtrlJKMenuNavigation } from '../utils/menuKeyboardNavigation';
import { Button, type ButtonProps } from './Button';
import { Surface, type SurfaceProps } from './Surface';

type PortalMount = ComponentProps<typeof KobalteSelect.Portal>['mount'];
type SelectPortalScope = 'local';

type SelectContextValue = {
  multiple: boolean;
};

const SelectContext = createContext<SelectContextValue>();

export type SelectContentProps = ComponentProps<
  typeof KobalteSelect.Content
> & {
  depth?: SurfaceProps['depth'];
  mount?: PortalMount;
  portalScope?: SelectPortalScope;
};
export type SelectTriggerProps = ComponentProps<typeof KobalteSelect.Trigger> &
  ButtonProps;
export type SelectListboxProps = ComponentProps<typeof KobalteSelect.Listbox>;
export type SelectItemProps = ComponentProps<typeof KobalteSelect.Item>;
export type SelectItemLabelProps = ComponentProps<
  typeof KobalteSelect.ItemLabel
>;
export type SelectItemIndicatorProps = ComponentProps<
  typeof KobalteSelect.ItemIndicator
>;
export type SelectValueProps = ComponentProps<typeof KobalteSelect.Value>;

const ROW_CLASS =
  'group rounded-lg w-full flex items-center gap-2 px-2 h-8 text-left font-medium text-xs cursor-default outline-none hover:bg-ink/5 data-highlighted:bg-ink/5 data-disabled:opacity-50 data-disabled:cursor-not-allowed';

const CHECKBOX_CLASS = cn(
  'inline-flex items-center justify-center size-3.5 shrink-0 rounded-sm',
  'border border-transparent text-surface',
  'group-hover:not-hover:border-edge-muted group-data-highlighted:not-hover:border-edge-muted',
  'hover:border-accent',
  'group-data-selected:bg-accent group-data-selected:border-accent'
);

function resolvePortalMount(
  searchRef: HTMLElement | undefined,
  mount: PortalMount,
  portalScope: SelectPortalScope | undefined
): PortalMount {
  if (mount || portalScope !== 'local') return mount;
  return searchRef?.closest<HTMLElement>('.portal-scope') ?? undefined;
}

function installKeyboardNavigation(el: HTMLElement) {
  const cleanup = addCtrlJKMenuNavigation(el);
  onCleanup(cleanup);
}

function callRef<T>(ref: ((el: T) => void) | undefined, el: T) {
  ref?.(el);
}

function SelectContent(props: SelectContentProps) {
  let searchRef: HTMLDivElement | undefined;
  const [local, rest] = splitProps(props, [
    'depth',
    'class',
    'mount',
    'portalScope',
    'children',
    'ref',
  ]);
  const setContentRef = (el: HTMLElement) => {
    installKeyboardNavigation(el);
    callRef(local.ref, el);
  };

  return (
    <>
      <div class="hidden" ref={searchRef} />
      <KobalteSelect.Portal
        mount={resolvePortalMount(searchRef, local.mount, local.portalScope)}
      >
        <KobalteSelect.Content
          class={cn('rounded-xl size-auto z-action-menu', local.class)}
          depth={local.depth ?? 2}
          as={Surface}
          {...rest}
          ref={setContentRef}
        >
          {local.children}
        </KobalteSelect.Content>
      </KobalteSelect.Portal>
    </>
  );
}

function SelectListbox(props: SelectListboxProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteSelect.Listbox
      class={cn('flex flex-col gap-0.5 bg-surface p-1.5', local.class)}
      {...rest}
    />
  );
}

function SelectItem(props: SelectItemProps) {
  const context = useContext(SelectContext);
  const [local, rest] = splitProps(props, ['class', 'children']);

  return (
    <KobalteSelect.Item class={cn(ROW_CLASS, local.class)} {...rest}>
      {context?.multiple ? (
        <div class={CHECKBOX_CLASS}>
          <KobalteSelect.ItemIndicator>
            <CheckIcon class="size-2.5" />
          </KobalteSelect.ItemIndicator>
        </div>
      ) : null}
      <KobalteSelect.ItemLabel class="min-w-0 flex-1">
        {local.children}
      </KobalteSelect.ItemLabel>
      {!context?.multiple ? (
        <KobalteSelect.ItemIndicator class="text-accent">
          <CheckIcon class="size-3" />
        </KobalteSelect.ItemIndicator>
      ) : null}
    </KobalteSelect.Item>
  );
}

function SelectTrigger(props: SelectTriggerProps) {
  return (
    <KobalteSelect.Trigger variant="base" as={Button} size="sm" {...props} />
  );
}

function SelectRoot<Option>(
  props: ComponentProps<typeof KobalteSelect<Option>>
) {
  return (
    <SelectContext.Provider value={{ multiple: !!props.multiple }}>
      <KobalteSelect<Option> gutter={4} {...(props as any)} />
    </SelectContext.Provider>
  );
}

export const Select = Object.assign(SelectRoot, {
  ItemIndicator: KobalteSelect.ItemIndicator,
  HiddenSelect: KobalteSelect.HiddenSelect,
  Description: KobalteSelect.Description,
  ErrorMessage: KobalteSelect.ErrorMessage,
  ItemLabel: KobalteSelect.ItemLabel,
  CaretDownIcon,
  Listbox: SelectListbox,
  Content: SelectContent,
  Trigger: SelectTrigger,
  Value: KobalteSelect.Value,
  Item: SelectItem,
});
