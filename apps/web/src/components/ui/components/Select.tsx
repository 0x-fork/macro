import type { CollectionNode, PolymorphicProps } from '@kobalte/core';
import {
  Select as KobalteSelect,
  type SelectContentProps as KobalteSelectContentProps,
  type SelectDescriptionProps as KobalteSelectDescriptionProps,
  type SelectErrorMessageProps as KobalteSelectErrorMessageProps,
  type SelectItemIndicatorProps as KobalteSelectItemIndicatorProps,
  type SelectItemLabelProps as KobalteSelectItemLabelProps,
  type SelectItemProps as KobalteSelectItemProps,
  type SelectLabelProps as KobalteSelectLabelProps,
  type SelectListboxProps as KobalteSelectListboxProps,
  type SelectRootProps as KobalteSelectRootProps,
  type SelectTriggerProps as KobalteSelectTriggerProps,
  type SelectValueProps as KobalteSelectValueProps,
} from '@kobalte/core/select';
import CaretDownIcon from '@phosphor/caret-down.svg';
import CheckIcon from '@phosphor/check.svg';
import { type JSX, Show, splitProps } from 'solid-js';
import { cn } from '../utils/classname';
import {
  FIELD_DESCRIPTION_CLASS,
  FIELD_ERROR_CLASS,
  FIELD_LABEL_CLASS,
  FIELD_ROOT_CLASS,
  MENU_CONTENT_CLASS,
  MENU_ITEM_CLASS,
  MENU_LISTBOX_CLASS,
  TRIGGER_CONTROL_CLASS,
} from './formStyles';

export type SelectProps<T = unknown> = PolymorphicProps<
  'div',
  KobalteSelectRootProps<T, never, 'div'>
>;
export type SelectTriggerProps = PolymorphicProps<
  'button',
  KobalteSelectTriggerProps<'button'>
>;
export type SelectContentProps = PolymorphicProps<
  'div',
  KobalteSelectContentProps<'div'>
>;
export type SelectListboxProps<T = unknown> = PolymorphicProps<
  'ul',
  KobalteSelectListboxProps<T, never, 'ul'>
>;
export type SelectLabelProps = PolymorphicProps<
  'label',
  KobalteSelectLabelProps<'label'>
>;
export type SelectDescriptionProps = PolymorphicProps<
  'div',
  KobalteSelectDescriptionProps<'div'>
>;
export type SelectErrorMessageProps = PolymorphicProps<
  'div',
  KobalteSelectErrorMessageProps<'div'>
>;
export type SelectItemProps = PolymorphicProps<
  'li',
  KobalteSelectItemProps<'li'>
>;
export type SelectValueProps<T = unknown> = PolymorphicProps<
  'span',
  KobalteSelectValueProps<T, 'span'>
>;
export type SelectItemLabelProps = PolymorphicProps<
  'div',
  KobalteSelectItemLabelProps<'div'>
>;
export type SelectItemIndicatorProps = PolymorphicProps<
  'div',
  KobalteSelectItemIndicatorProps<'div'>
>;

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function SelectRoot<T>(props: SelectProps<T>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteSelect<T>
      class={cn(FIELD_ROOT_CLASS, local.class)}
      gutter={4}
      {...rest}
    />
  );
}

function SelectLabel(props: SelectLabelProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteSelect.Label class={cn(FIELD_LABEL_CLASS, local.class)} {...rest} />
  );
}

function SelectDescription(props: SelectDescriptionProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteSelect.Description
      class={cn(FIELD_DESCRIPTION_CLASS, local.class)}
      {...rest}
    />
  );
}

function SelectErrorMessage(props: SelectErrorMessageProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteSelect.ErrorMessage
      class={cn(FIELD_ERROR_CLASS, local.class)}
      {...rest}
    />
  );
}

function SelectTrigger(props: SelectTriggerProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <KobalteSelect.Trigger
      class={cn(TRIGGER_CONTROL_CLASS, local.class)}
      {...rest}
    >
      {local.children ?? (
        <>
          <KobalteSelect.Value />
          <KobalteSelect.Icon>
            <CaretDownIcon class="size-3.5 text-ink-muted" />
          </KobalteSelect.Icon>
        </>
      )}
    </KobalteSelect.Trigger>
  );
}

function SelectContent(props: SelectContentProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteSelect.Portal>
      <KobalteSelect.Content
        class={cn(MENU_CONTENT_CLASS, local.class)}
        {...rest}
      />
    </KobalteSelect.Portal>
  );
}

function SelectListbox<T>(props: SelectListboxProps<T>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteSelect.Listbox<T>
      class={cn(MENU_LISTBOX_CLASS, local.class)}
      {...rest}
    />
  );
}

function SelectItem(props: SelectItemProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteSelect.Item class={cn(MENU_ITEM_CLASS, local.class)} {...rest} />
  );
}

function SelectItemLabel(props: SelectItemLabelProps) {
  return <KobalteSelect.ItemLabel {...props} />;
}

function SelectItemIndicator(props: SelectItemIndicatorProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <KobalteSelect.ItemIndicator class={cn('ml-auto', local.class)} {...rest}>
      {local.children ?? <CheckIcon class="size-3.5" />}
    </KobalteSelect.ItemIndicator>
  );
}

function SelectValue<T>(props: SelectValueProps<T>) {
  return <KobalteSelect.Value<T> {...props} />;
}

export const Select = Object.assign(SelectRoot, {
  Label: SelectLabel,
  Description: SelectDescription,
  ErrorMessage: SelectErrorMessage,
  Trigger: SelectTrigger,
  Value: SelectValue,
  Icon: KobalteSelect.Icon,
  Content: SelectContent,
  Listbox: SelectListbox,
  Item: SelectItem,
  ItemLabel: SelectItemLabel,
  ItemDescription: KobalteSelect.ItemDescription,
  ItemIndicator: SelectItemIndicator,
  HiddenSelect: KobalteSelect.HiddenSelect,
  Section: KobalteSelect.Section,
});

export type SimpleSelectOption = SelectOption;

export type SimpleSelectProps = SelectProps<SimpleSelectOption> & {
  label?: JSX.Element;
  description?: JSX.Element;
  errorMessage?: JSX.Element;
  options: SimpleSelectOption[];
  triggerClass?: string;
  contentClass?: string;
};

export function SimpleSelect(props: SimpleSelectProps) {
  const [local, rootProps] = splitProps(props, [
    'label',
    'description',
    'errorMessage',
    'placeholder',
    'options',
    'triggerClass',
    'contentClass',
  ]);

  return (
    <Select<SimpleSelectOption>
      optionValue="value"
      optionTextValue="label"
      optionDisabled="disabled"
      itemComponent={(itemProps: {
        item: CollectionNode<SimpleSelectOption>;
      }) => (
        <Select.Item item={itemProps.item}>
          <Select.ItemLabel class="min-w-0 flex-1 truncate">
            {itemProps.item.rawValue.label}
          </Select.ItemLabel>
          <Select.ItemIndicator />
        </Select.Item>
      )}
      {...rootProps}
      placeholder={local.placeholder}
      options={local.options}
    >
      <Show when={local.label}>
        <Select.Label>{local.label}</Select.Label>
      </Show>
      <Select.Trigger class={local.triggerClass}>
        <Select.Value<SimpleSelectOption>>
          {(state) => state.selectedOption()?.label ?? local.placeholder}
        </Select.Value>
        <KobalteSelect.Icon>
          <CaretDownIcon class="size-3.5 text-ink-muted" />
        </KobalteSelect.Icon>
      </Select.Trigger>
      <Select.Content class={local.contentClass}>
        <Select.Listbox />
      </Select.Content>
      <Show when={local.description}>
        <Select.Description>{local.description}</Select.Description>
      </Show>
      <Show when={local.errorMessage}>
        <Select.ErrorMessage>{local.errorMessage}</Select.ErrorMessage>
      </Show>
      <KobalteSelect.HiddenSelect />
    </Select>
  );
}
