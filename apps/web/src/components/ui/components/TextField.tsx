import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import {
  TextField as KobalteTextField,
  type TextFieldDescriptionProps as KobalteTextFieldDescriptionProps,
  type TextFieldErrorMessageProps as KobalteTextFieldErrorMessageProps,
  type TextFieldInputProps as KobalteTextFieldInputProps,
  type TextFieldLabelProps as KobalteTextFieldLabelProps,
  type TextFieldRootProps as KobalteTextFieldRootProps,
  type TextFieldTextAreaProps as KobalteTextFieldTextAreaProps,
} from '@kobalte/core/text-field';
import { type JSX, Show, splitProps } from 'solid-js';
import { cn } from '../utils/classname';
import {
  FIELD_DESCRIPTION_CLASS,
  FIELD_ERROR_CLASS,
  FIELD_LABEL_CLASS,
  FIELD_ROOT_CLASS,
  TEXT_CONTROL_CLASS,
  TEXTAREA_CONTROL_CLASS,
} from './formStyles';

export type TextFieldProps = PolymorphicProps<
  'div',
  KobalteTextFieldRootProps<'div'>
>;
export type TextFieldInputProps = PolymorphicProps<
  'input',
  KobalteTextFieldInputProps<'input'>
>;
export type TextFieldTextAreaProps = PolymorphicProps<
  'textarea',
  KobalteTextFieldTextAreaProps<'textarea'>
>;
export type TextFieldLabelProps = PolymorphicProps<
  'label',
  KobalteTextFieldLabelProps<'label'>
>;
export type TextFieldDescriptionProps = PolymorphicProps<
  'div',
  KobalteTextFieldDescriptionProps<'div'>
>;
export type TextFieldErrorMessageProps = PolymorphicProps<
  'div',
  KobalteTextFieldErrorMessageProps<'div'>
>;

function TextFieldRoot(props: TextFieldProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteTextField class={cn(FIELD_ROOT_CLASS, local.class)} {...rest} />
  );
}

function TextFieldLabel(props: TextFieldLabelProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteTextField.Label
      class={cn(FIELD_LABEL_CLASS, local.class)}
      {...rest}
    />
  );
}

function TextFieldInput(props: TextFieldInputProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteTextField.Input
      class={cn(TEXT_CONTROL_CLASS, local.class)}
      {...rest}
    />
  );
}

function TextFieldTextArea(props: TextFieldTextAreaProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteTextField.TextArea
      class={cn(TEXTAREA_CONTROL_CLASS, local.class)}
      {...rest}
    />
  );
}

function TextFieldDescription(props: TextFieldDescriptionProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteTextField.Description
      class={cn(FIELD_DESCRIPTION_CLASS, local.class)}
      {...rest}
    />
  );
}

function TextFieldErrorMessage(props: TextFieldErrorMessageProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteTextField.ErrorMessage
      class={cn(FIELD_ERROR_CLASS, local.class)}
      {...rest}
    />
  );
}

export const TextField = Object.assign(TextFieldRoot, {
  Label: TextFieldLabel,
  Input: TextFieldInput,
  TextArea: TextFieldTextArea,
  Description: TextFieldDescription,
  ErrorMessage: TextFieldErrorMessage,
});

type TextInputBaseProps = TextFieldProps & {
  label?: JSX.Element;
  description?: JSX.Element;
  errorMessage?: JSX.Element;
  inputClass?: string;
  placeholder?: string;
  type?: TextFieldInputProps['type'];
  inputProps?: TextFieldInputProps;
};

export type TextInputProps = TextInputBaseProps;

export function TextInput(props: TextInputProps) {
  const [local, rootProps] = splitProps(props, [
    'label',
    'description',
    'errorMessage',
    'inputClass',
    'placeholder',
    'type',
    'inputProps',
  ]);

  return (
    <TextField {...rootProps}>
      <Show when={local.label}>
        <TextField.Label>{local.label}</TextField.Label>
      </Show>
      <TextField.Input
        class={local.inputClass}
        placeholder={local.placeholder}
        type={local.type}
        {...local.inputProps}
      />
      <Show when={local.description}>
        <TextField.Description>{local.description}</TextField.Description>
      </Show>
      <Show when={local.errorMessage}>
        <TextField.ErrorMessage>{local.errorMessage}</TextField.ErrorMessage>
      </Show>
    </TextField>
  );
}

export type TextAreaProps = TextFieldProps & {
  label?: JSX.Element;
  description?: JSX.Element;
  errorMessage?: JSX.Element;
  textAreaClass?: string;
  placeholder?: string;
  textAreaProps?: TextFieldTextAreaProps;
};

export function TextArea(props: TextAreaProps) {
  const [local, rootProps] = splitProps(props, [
    'label',
    'description',
    'errorMessage',
    'textAreaClass',
    'placeholder',
    'textAreaProps',
  ]);

  return (
    <TextField {...rootProps}>
      <Show when={local.label}>
        <TextField.Label>{local.label}</TextField.Label>
      </Show>
      <TextField.TextArea
        class={local.textAreaClass}
        placeholder={local.placeholder}
        {...local.textAreaProps}
      />
      <Show when={local.description}>
        <TextField.Description>{local.description}</TextField.Description>
      </Show>
      <Show when={local.errorMessage}>
        <TextField.ErrorMessage>{local.errorMessage}</TextField.ErrorMessage>
      </Show>
    </TextField>
  );
}
