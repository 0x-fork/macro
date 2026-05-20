import { cn } from '@ui';
import {
  type ComponentProps,
  type JSX,
  splitProps,
  type ValidComponent,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { match } from 'ts-pattern';

type SlotElement = 'div' | 'span' | 'button';

export type MessageSlotPlacement =
  | 'icon'
  | 'header'
  | 'content'
  | 'footer'
  | 'actions';

type CommonProps = {
  children?: JSX.Element;
  placement: MessageSlotPlacement;
  class?: string;
  style?: JSX.CSSProperties | string;
};

type SlotProps<T extends ValidComponent = 'div'> = { as?: T } & CommonProps &
  Omit<ComponentProps<T>, keyof CommonProps | 'component'>;

function placementStyle(
  placement: MessageSlotPlacement
): Partial<JSX.CSSProperties> {
  return match(placement)
    .with('icon', () => ({ 'grid-area': 'icon' }))
    .with('header', () => ({ 'grid-area': 'header' }))
    .with('content', () => ({ 'grid-area': 'content' }))
    .with('footer', () => ({ 'grid-area': 'footer' }))
    .with('actions', () => ({ 'grid-area': 'actions' }))
    .exhaustive();
}

export function Slot<T extends SlotElement = 'div'>(props: SlotProps<T>) {
  const [local, rest] = splitProps(props, [
    'as',
    'class',
    'children',
    'placement',
    'style',
  ]);

  return (
    <Dynamic
      component={local.as ?? ('div' as SlotElement)}
      class={cn('message-slot min-w-0', local.class)}
      data-message-slot={local.placement}
      style={{
        ...placementStyle(local.placement),
        ...(typeof local.style === 'object' ? local.style : {}),
      }}
      {...rest}
    >
      {local.children}
    </Dynamic>
  );
}
