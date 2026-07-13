import type { CollectionNode, PolymorphicProps } from '@kobalte/core';
import {
  Combobox as KobalteCombobox,
  type ComboboxContentProps as KobalteComboboxContentProps,
  type ComboboxControlProps as KobalteComboboxControlProps,
  type ComboboxDescriptionProps as KobalteComboboxDescriptionProps,
  type ComboboxErrorMessageProps as KobalteComboboxErrorMessageProps,
  type ComboboxInputProps as KobalteComboboxInputProps,
  type ComboboxItemIndicatorProps as KobalteComboboxItemIndicatorProps,
  type ComboboxItemLabelProps as KobalteComboboxItemLabelProps,
  type ComboboxItemProps as KobalteComboboxItemProps,
  type ComboboxLabelProps as KobalteComboboxLabelProps,
  type ComboboxListboxProps as KobalteComboboxListboxProps,
  type ComboboxRootProps as KobalteComboboxRootProps,
  type ComboboxTriggerProps as KobalteComboboxTriggerProps,
} from '@kobalte/core/combobox';
import CaretDownIcon from '@phosphor/caret-down.svg';
import CheckIcon from '@phosphor/check.svg';
import { type JSX, Show, splitProps } from 'solid-js';
import { cn } from '../utils/classname';
import {
  COMBO_CONTROL_CLASS,
  FIELD_DESCRIPTION_CLASS,
  FIELD_ERROR_CLASS,
  FIELD_LABEL_CLASS,
  FIELD_ROOT_CLASS,
  MENU_CONTENT_CLASS,
  MENU_ITEM_CLASS,
  MENU_LISTBOX_CLASS,
} from './formStyles';

export type ComboboxProps<T = unknown> = PolymorphicProps<
  'div',
  KobalteComboboxRootProps<T, never, 'div'>
>;
export type ComboboxControlProps<T = unknown> = PolymorphicProps<
  'div',
  KobalteComboboxControlProps<T, 'div'>
>;
export type ComboboxInputProps = PolymorphicProps<
  'input',
  KobalteComboboxInputProps<'input'>
>;
export type ComboboxTriggerProps = PolymorphicProps<
  'button',
  KobalteComboboxTriggerProps<'button'>
>;
export type ComboboxContentProps = PolymorphicProps<
  'div',
  KobalteComboboxContentProps<'div'>
>;
export type ComboboxListboxProps<T = unknown> = PolymorphicProps<
  'ul',
  KobalteComboboxListboxProps<T, never, 'ul'>
>;
export type ComboboxLabelProps = PolymorphicProps<
  'label',
  KobalteComboboxLabelProps<'label'>
>;
export type ComboboxDescriptionProps = PolymorphicProps<
  'div',
  KobalteComboboxDescriptionProps<'div'>
>;
export type ComboboxErrorMessageProps = PolymorphicProps<
  'div',
  KobalteComboboxErrorMessageProps<'div'>
>;
export type ComboboxItemProps = PolymorphicProps<
  'li',
  KobalteComboboxItemProps<'li'>
>;
export type ComboboxItemLabelProps = PolymorphicProps<
  'div',
  KobalteComboboxItemLabelProps<'div'>
>;
export type ComboboxItemIndicatorProps = PolymorphicProps<
  'div',
  KobalteComboboxItemIndicatorProps<'div'>
>;

type ComboboxOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function ComboboxRoot<T>(props: ComboboxProps<T>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteCombobox<T>
      class={cn(FIELD_ROOT_CLASS, local.class)}
      gutter={4}
      {...rest}
    />
  );
}

function ComboboxLabel(props: ComboboxLabelProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteCombobox.Label
      class={cn(FIELD_LABEL_CLASS, local.class)}
      {...rest}
    />
  );
}

function ComboboxDescription(props: ComboboxDescriptionProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteCombobox.Description
      class={cn(FIELD_DESCRIPTION_CLASS, local.class)}
      {...rest}
    />
  );
}

function ComboboxErrorMessage(props: ComboboxErrorMessageProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteCombobox.ErrorMessage
      class={cn(FIELD_ERROR_CLASS, local.class)}
      {...rest}
    />
  );
}

function ComboboxControl<T>(props: ComboboxControlProps<T>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteCombobox.Control<T>
      class={cn(COMBO_CONTROL_CLASS, local.class)}
      {...rest}
    />
  );
}

function ComboboxInput(props: ComboboxInputProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteCombobox.Input
      class={cn(
        'min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-placeholder',
        local.class
      )}
      {...rest}
    />
  );
}

function ComboboxTrigger(props: ComboboxTriggerProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <KobalteCombobox.Trigger
      class={cn('shrink-0 text-ink-muted outline-none', local.class)}
      {...rest}
    >
      {local.children ?? (
        <KobalteCombobox.Icon>
          <CaretDownIcon class="size-3.5" />
        </KobalteCombobox.Icon>
      )}
    </KobalteCombobox.Trigger>
  );
}

function ComboboxContent(props: ComboboxContentProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteCombobox.Portal>
      <KobalteCombobox.Content
        class={cn(MENU_CONTENT_CLASS, local.class)}
        {...rest}
      />
    </KobalteCombobox.Portal>
  );
}

function ComboboxListbox<T>(props: ComboboxListboxProps<T>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteCombobox.Listbox<T>
      class={cn(MENU_LISTBOX_CLASS, local.class)}
      {...rest}
    />
  );
}

function ComboboxItem(props: ComboboxItemProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteCombobox.Item class={cn(MENU_ITEM_CLASS, local.class)} {...rest} />
  );
}

function ComboboxItemLabel(props: ComboboxItemLabelProps) {
  return <KobalteCombobox.ItemLabel {...props} />;
}

function ComboboxItemIndicator(props: ComboboxItemIndicatorProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <KobalteCombobox.ItemIndicator class={cn('ml-auto', local.class)} {...rest}>
      {local.children ?? <CheckIcon class="size-3.5" />}
    </KobalteCombobox.ItemIndicator>
  );
}

export const Combobox = Object.assign(ComboboxRoot, {
  Label: ComboboxLabel,
  Description: ComboboxDescription,
  ErrorMessage: ComboboxErrorMessage,
  Control: ComboboxControl,
  Input: ComboboxInput,
  Trigger: ComboboxTrigger,
  Icon: KobalteCombobox.Icon,
  Content: ComboboxContent,
  Listbox: ComboboxListbox,
  Item: ComboboxItem,
  ItemLabel: ComboboxItemLabel,
  ItemDescription: KobalteCombobox.ItemDescription,
  ItemIndicator: ComboboxItemIndicator,
  HiddenSelect: KobalteCombobox.HiddenSelect,
  Section: KobalteCombobox.Section,
});

export type SimpleComboboxOption = ComboboxOption;

export type SimpleComboboxProps = ComboboxProps<SimpleComboboxOption> & {
  label?: JSX.Element;
  description?: JSX.Element;
  errorMessage?: JSX.Element;
  options: SimpleComboboxOption[];
  inputClass?: string;
  controlClass?: string;
  contentClass?: string;
};

export function SimpleCombobox(props: SimpleComboboxProps) {
  const [local, rootProps] = splitProps(props, [
    'label',
    'description',
    'errorMessage',
    'options',
    'inputClass',
    'controlClass',
    'contentClass',
  ]);

  return (
    <Combobox<SimpleComboboxOption>
      optionValue="value"
      optionTextValue="label"
      optionLabel="label"
      optionDisabled="disabled"
      itemComponent={(itemProps: {
        item: CollectionNode<SimpleComboboxOption>;
      }) => (
        <Combobox.Item item={itemProps.item}>
          <Combobox.ItemLabel class="min-w-0 flex-1 truncate">
            {itemProps.item.rawValue.label}
          </Combobox.ItemLabel>
          <Combobox.ItemIndicator />
        </Combobox.Item>
      )}
      {...rootProps}
      options={local.options}
    >
      <Show when={local.label}>
        <Combobox.Label>{local.label}</Combobox.Label>
      </Show>
      <Combobox.Control class={local.controlClass}>
        <Combobox.Input class={local.inputClass} />
        <Combobox.Trigger />
      </Combobox.Control>
      <Combobox.Content class={local.contentClass}>
        <Combobox.Listbox />
      </Combobox.Content>
      <Show when={local.description}>
        <Combobox.Description>{local.description}</Combobox.Description>
      </Show>
      <Show when={local.errorMessage}>
        <Combobox.ErrorMessage>{local.errorMessage}</Combobox.ErrorMessage>
      </Show>
      <KobalteCombobox.HiddenSelect />
    </Combobox>
  );
}
