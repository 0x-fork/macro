import {
  Checkbox as KobalteCheckbox,
  type CheckboxControlProps as KobalteCheckboxControlProps,
  type CheckboxDescriptionProps as KobalteCheckboxDescriptionProps,
  type CheckboxErrorMessageProps as KobalteCheckboxErrorMessageProps,
  type CheckboxIndicatorProps as KobalteCheckboxIndicatorProps,
  type CheckboxLabelProps as KobalteCheckboxLabelProps,
  type CheckboxRootProps as KobalteCheckboxRootProps,
} from '@kobalte/core/checkbox';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import CheckIcon from '@phosphor/check.svg';
import MinusIcon from '@phosphor/minus.svg';
import type { JSX } from 'solid-js';
import { Show, splitProps } from 'solid-js';
import { cn } from '../utils/classname';
import {
  FIELD_DESCRIPTION_CLASS,
  FIELD_ERROR_CLASS,
  FIELD_LABEL_CLASS,
} from './formStyles';

/*
<Checkbox checked={...} onChange={...}>
  <Checkbox.Control />
</Checkbox>

A bare <Checkbox.Control /> renders its own <Checkbox.Indicator /> with a
check (or minus for indeterminate). Override by passing children:

<Checkbox.Control>
  <Checkbox.Indicator>
    <CustomGlyph />
  </Checkbox.Indicator>
</Checkbox.Control>
*/

export type CheckboxProps = PolymorphicProps<
  'div',
  KobalteCheckboxRootProps<'div'>
>;
export type CheckboxControlProps = PolymorphicProps<
  'div',
  KobalteCheckboxControlProps<'div'>
>;
export type CheckboxIndicatorProps = PolymorphicProps<
  'div',
  KobalteCheckboxIndicatorProps<'div'>
>;
export type CheckboxLabelProps = PolymorphicProps<
  'label',
  KobalteCheckboxLabelProps<'label'>
>;
export type CheckboxDescriptionProps = PolymorphicProps<
  'div',
  KobalteCheckboxDescriptionProps<'div'>
>;
export type CheckboxErrorMessageProps = PolymorphicProps<
  'div',
  KobalteCheckboxErrorMessageProps<'div'>
>;

const CONTROL_CLASS = cn(
  'inline-flex items-center justify-center size-4 shrink-0 rounded-sm text-surface',
  'bg-surface border border-edge',
  'data-checked:bg-accent data-checked:border-accent',
  'data-indeterminate:bg-accent data-indeterminate:border-accent',
  'data-disabled:opacity-50 data-disabled:cursor-not-allowed',
  'data-invalid:border-failure'
);

function CheckboxIndicator(props: CheckboxIndicatorProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <KobalteCheckbox.Indicator
      class={cn('group inline-flex items-center justify-center', local.class)}
      {...rest}
    >
      {local.children ?? (
        <>
          <CheckIcon class="size-3 group-data-indeterminate:hidden" />
          <MinusIcon class="size-3 hidden group-data-indeterminate:block" />
        </>
      )}
    </KobalteCheckbox.Indicator>
  );
}

function CheckboxLabel(props: CheckboxLabelProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteCheckbox.Label
      class={cn(FIELD_LABEL_CLASS, 'leading-5', local.class)}
      {...rest}
    />
  );
}

function CheckboxDescription(props: CheckboxDescriptionProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteCheckbox.Description
      class={cn(FIELD_DESCRIPTION_CLASS, local.class)}
      {...rest}
    />
  );
}

function CheckboxErrorMessage(props: CheckboxErrorMessageProps) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteCheckbox.ErrorMessage
      class={cn(FIELD_ERROR_CLASS, local.class)}
      {...rest}
    />
  );
}

function CheckboxControl(props: CheckboxControlProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <>
      <KobalteCheckbox.Input class="sr-only" />
      <KobalteCheckbox.Control class={cn(CONTROL_CLASS, local.class)} {...rest}>
        {local.children ?? <CheckboxIndicator />}
      </KobalteCheckbox.Control>
    </>
  );
}

export const Checkbox = Object.assign(
  (props: CheckboxProps) => {
    const [local, rest] = splitProps(props, ['class']);
    return (
      <KobalteCheckbox
        class={cn('inline-flex items-center gap-2', local.class)}
        {...rest}
      />
    );
  },
  {
    ErrorMessage: CheckboxErrorMessage,
    Description: CheckboxDescription,
    Label: CheckboxLabel,
    Input:
      KobalteCheckbox.Input /* passthrough — Control already renders one */,
    Indicator: CheckboxIndicator,
    Control: CheckboxControl,
  }
);

export type SingleSelectCheckProps = { active: boolean };

export const SingleSelectCheck = (props: SingleSelectCheckProps) => (
  <CheckIcon
    class={cn('size-3 shrink-0 text-accent', !props.active && 'hidden')}
  />
);

export type InlineCheckmarkProps = { checked: boolean };
export type InlineCheckboxProps = InlineCheckmarkProps;

/**
 * Visual-only inline checkbox affordance for legacy/common menu rows.
 * Pair it with a clickable parent for the actual toggle behavior.
 */
export const InlineCheckmark = (props: InlineCheckmarkProps) => (
  <span
    aria-hidden
    class={cn(
      'inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm',
      props.checked
        ? 'bg-accent text-surface'
        : 'border border-edge-muted bg-transparent text-transparent'
    )}
  >
    <CheckIcon class="size-2.5" />
  </span>
);

export const InlineCheckbox = InlineCheckmark;

export type SimpleCheckboxProps = CheckboxProps & {
  label?: JSX.Element;
  description?: JSX.Element;
  errorMessage?: JSX.Element;
  controlClass?: string;
};

export function SimpleCheckbox(props: SimpleCheckboxProps) {
  const [local, rootProps] = splitProps(props, [
    'label',
    'description',
    'errorMessage',
    'controlClass',
  ]);

  return (
    <Checkbox {...rootProps}>
      <Checkbox.Control class={local.controlClass} />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <Show when={local.label}>
          <Checkbox.Label>{local.label}</Checkbox.Label>
        </Show>
        <Show when={local.description}>
          <Checkbox.Description>{local.description}</Checkbox.Description>
        </Show>
        <Show when={local.errorMessage}>
          <Checkbox.ErrorMessage>{local.errorMessage}</Checkbox.ErrorMessage>
        </Show>
      </div>
    </Checkbox>
  );
}
