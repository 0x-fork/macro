import {
  ToggleButton as KToggleButton,
  type ToggleButtonRootOptions,
} from '@kobalte/core/toggle-button';
import {
  createEffect,
  createSignal,
  type JSX,
  // onMount,
  type ParentComponent,
  type ValidComponent,
} from 'solid-js';

type Size = 'SM' | 'Base';
const sizeClass: Record<Size, string> = {
  SM: 'text-xs p-1 leading-none',
  Base: 'text-[14px] p-1 px-[9px]',
};

export const ToggleButton: ParentComponent<
  {
    size?: Size;
    tabIndex?: number;
    animateFlickerOnDeactivate?: boolean;
    class?: string;
    classList?: JSX.CustomAttributes<HTMLButtonElement>['classList'];
    disabled?: boolean;
    as?: ValidComponent;
  } & ToggleButtonRootOptions
> = (props) => {
  const [pressed, setPressed] = createSignal(props.pressed);
  // const [showFlicker, setShowFlicker] = createSignal(false);
  // let init = true;

  // createEffect((prevPressed) => {
  //   const pressedVal = pressed();

  //   if (init) {
  //     return pressedVal;
  //   }
  //   if (pressedVal === prevPressed) return pressedVal;
  //   if (props.animateFlickerOnDeactivate === false && pressedVal === false) {
  //     return pressedVal;
  //   }

  //   setShowFlicker(true);
  //   return pressedVal;
  // });

  createEffect(() => {
    if (props.pressed !== undefined) {
      setPressed(props.pressed);
    }
  });

  // onMount(() => {
  //   setTimeout(() => {
  //     init = false;
  //   });
  // });

  const onChange = (isPressed: boolean) => {
    if (props.pressed === undefined) {
      setPressed(isPressed);
    }
    props.onChange?.(isPressed);
  };

  return (
    <KToggleButton
      class={`w-fit disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none [&:focus]:disabled:[--focus-border-inset:0] [&:focus]:[--focus-border-inset:-3px] ${props.class ?? ''}`}
      classList={props.classList}
      pressed={pressed()}
      onChange={onChange}
      aria-label="selected"
      tabIndex={props.tabIndex}
      disabled={props.disabled}
      as={props.as}
    >
      {(state) => (
        <div
          class="border min-w-[22px] font-medium font-mono text-center uppercase leading-none whitespace-nowrap"
          classList={{
            [`${sizeClass[props.size || 'Base']}`]: true,
            'bg-accent/20 text-ink border-accent/30 bracket bracket-offset-2': state.pressed(),
            'text-ink-muted border-edge-muted': !state.pressed(),
            // 'animate-[flicker_50ms_3]': showFlicker(),
            'hover:opacity-80': !props.disabled,
          }}
          // onAnimationEnd={() => {
          //   setShowFlicker(false);
          // }}
        >
          {props.children}
        </div>
      )}
    </KToggleButton>
  );
};
