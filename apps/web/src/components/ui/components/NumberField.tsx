import {
  NumberField as KobalteNumberField,
  type NumberFieldDecrementTriggerProps as KobalteNumberFieldDecrementTriggerProps,
  type NumberFieldDescriptionProps as KobalteNumberFieldDescriptionProps,
  type NumberFieldErrorMessageProps as KobalteNumberFieldErrorMessageProps,
  type NumberFieldIncrementTriggerProps as KobalteNumberFieldIncrementTriggerProps,
  type NumberFieldInputProps as KobalteNumberFieldInputProps,
  type NumberFieldLabelProps as KobalteNumberFieldLabelProps,
  type NumberFieldRootProps as KobalteNumberFieldRootProps,
} from '@kobalte/core/number-field';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import MinusIcon from '@phosphor/minus.svg';
import PlusIcon from '@phosphor/plus.svg';
import { type JSX, Show, splitProps } from 'solid-js';
import { cn } from '../utils/classname';
import {
  FIELD_DESCRIPTION_CLASS,
  FIELD_ERROR_CLASS,
  FIELD_LABEL_CLASS,
  FIELD_ROOT_CLASS,
  TEXT_CONTROL_CLASS,
} from './formStyles';

export type NumberFieldProps = PolymorphicProps<
  'div',
  KobalteNumberFieldRootProps<'div'>
>;
export type NumberFieldInputProps = PolymorphicProps<
  'input',
  KobalteNumberFieldInputProps<'input'>
>;
export type NumberFieldLabelProps = PolymorphicProps<
  'label',
  KobalteNumberFieldLabelProps<'label'>
>;
export type NumberFieldDescriptionProps = PolymorphicProps<
  'div',
  KobalteNumberFieldDescriptionProps<'div'>
>;
export type NumberFieldErrorMessageProps = PolymorphicProps<
  'div',
  KobalteNumberFieldErrorMessageProps<'div'>
>;
export type NumberFieldIncrementTriggerProps = PolymorphicProps<
  'button',
  KobalteNumberFieldIncrementTriggerProps<'button'>
>;
export type NumberFieldDecrementTriggerProps = PolymorphicProps<
  'button',
  KobalteNumberFieldDecrementTriggerProps<'button'>
>;

const SPIN_BUTTON_CLASS = cn(
  'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted outline-none',
  'hover:bg-hover hover:text-ink data-disabled:opacity-50 data-disabled:cursor-not-allowed'
);

function NumberFieldRoot(props: NumberFieldProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteNumberField class={cn(FIELD_ROOT_CLASS, local.class)} {...rest} />
  );
}

function NumberFieldLabel(props: NumberFieldLabelProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteNumberField.Label
      class={cn(FIELD_LABEL_CLASS, local.class)}
      {...rest}
    />
  );
}

function NumberFieldInput(props: NumberFieldInputProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteNumberField.Input
      class={cn(TEXT_CONTROL_CLASS, 'tabular-nums', local.class)}
      {...rest}
    />
  );
}

function NumberFieldDescription(props: NumberFieldDescriptionProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteNumberField.Description
      class={cn(FIELD_DESCRIPTION_CLASS, local.class)}
      {...rest}
    />
  );
}

function NumberFieldErrorMessage(props: NumberFieldErrorMessageProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteNumberField.ErrorMessage
      class={cn(FIELD_ERROR_CLASS, local.class)}
      {...rest}
    />
  );
}

function NumberFieldIncrementTrigger(props: NumberFieldIncrementTriggerProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <KobalteNumberField.IncrementTrigger
      class={cn(SPIN_BUTTON_CLASS, local.class)}
      {...rest}
    >
      {local.children ?? <PlusIcon class="size-3.5" />}
    </KobalteNumberField.IncrementTrigger>
  );
}

function NumberFieldDecrementTrigger(props: NumberFieldDecrementTriggerProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <KobalteNumberField.DecrementTrigger
      class={cn(SPIN_BUTTON_CLASS, local.class)}
      {...rest}
    >
      {local.children ?? <MinusIcon class="size-3.5" />}
    </KobalteNumberField.DecrementTrigger>
  );
}

export const NumberField = Object.assign(NumberFieldRoot, {
  Label: NumberFieldLabel,
  Input: NumberFieldInput,
  Description: NumberFieldDescription,
  ErrorMessage: NumberFieldErrorMessage,
  HiddenInput: KobalteNumberField.HiddenInput,
  IncrementTrigger: NumberFieldIncrementTrigger,
  DecrementTrigger: NumberFieldDecrementTrigger,
});

export type NumberInputProps = NumberFieldProps & {
  label?: JSX.Element;
  description?: JSX.Element;
  errorMessage?: JSX.Element;
  inputClass?: string;
  inputProps?: NumberFieldInputProps;
  showSteppers?: boolean;
};

export function NumberInput(props: NumberInputProps) {
  const [local, rootProps] = splitProps(props, [
    'label',
    'description',
    'errorMessage',
    'inputClass',
    'inputProps',
    'showSteppers',
  ]);

  return (
    <NumberField {...rootProps}>
      <Show when={local.label}>
        <NumberField.Label>{local.label}</NumberField.Label>
      </Show>
      <div class="flex items-center gap-1">
        <NumberField.Input
          class={cn('flex-1', local.inputClass)}
          {...local.inputProps}
        />
        <Show when={local.showSteppers}>
          <div class="flex items-center gap-1">
            <NumberField.DecrementTrigger />
            <NumberField.IncrementTrigger />
          </div>
        </Show>
      </div>
      <NumberField.HiddenInput />
      <Show when={local.description}>
        <NumberField.Description>{local.description}</NumberField.Description>
      </Show>
      <Show when={local.errorMessage}>
        <NumberField.ErrorMessage>
          {local.errorMessage}
        </NumberField.ErrorMessage>
      </Show>
    </NumberField>
  );
}
