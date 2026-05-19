import { cn } from '../utils/classname';
import { type JSX, Show, splitProps } from 'solid-js';
import XIcon from '@phosphor/x.svg';

export type ChipSize = 'sm' | 'md' | 'lg';
export type ChipVariant = 'default' | 'accent' | 'muted';

export interface ChipProps {
  children: JSX.Element;
  size?: ChipSize;
  variant?: ChipVariant;
  class?: string;
  onRemove?: () => void;
  onClick?: () => void;
  icon?: JSX.Element;
  removable?: boolean;
}

const sizeStyles: Record<ChipSize, string> = {
  sm: 'text-xs py-0.5 pl-1.5 gap-1 [&_svg]:size-2.5',
  md: 'text-xs py-1 pl-2 gap-1.5 [&_svg]:size-3',
  lg: 'text-sm py-1.5 pl-2.5 gap-2 [&_svg]:size-4',
};

const removeButtonSizeStyles: Record<ChipSize, string> = {
  sm: 'px-1 [&_svg]:size-2.5',
  md: 'px-1.5 [&_svg]:size-3',
  lg: 'px-2 [&_svg]:size-3.5',
};

const variantStyles: Record<ChipVariant, string> = {
  default: 'bg-ink/10 text-ink-muted border-edge-muted hover:text-ink',
  accent: 'bg-accent/10 text-accent border-accent/20 hover:bg-accent/15',
  muted: 'bg-ink/5 text-ink-muted border-edge-muted hover:bg-ink/10',
};

export const Chip = (props: ChipProps) => {
  const [local, others] = splitProps(props, [
    'children',
    'size',
    'variant',
    'class',
    'onRemove',
    'onClick',
    'icon',
    'removable',
  ]);

  const size = () => local.size ?? 'md';
  const variant = () => local.variant ?? 'default';
  const isRemovable = () => local.removable ?? !!local.onRemove;

  const handleRemove = (e: MouseEvent) => {
    e.stopPropagation();
    local.onRemove?.();
  };

  return (
    <div
      class={cn(
        'inline-flex items-center rounded-md border transition-colors',
        sizeStyles[size()],
        variantStyles[variant()],
        local.onClick && 'cursor-pointer',
        !isRemovable() && 'pr-2',
        local.class
      )}
      onClick={local.onClick}
      {...others}
    >
      <Show when={local.icon}>
        <span class="shrink-0 flex items-center justify-center">
          {local.icon}
        </span>
      </Show>
      <span class="font-medium truncate">{local.children}</span>
      <Show when={isRemovable()}>
        <button
          type="button"
          class={cn(
            'min-h-full rounded-r-md transition-colors hover:bg-ink/10 hover:text-ink',
            removeButtonSizeStyles[size()]
          )}
          onClick={handleRemove}
        >
          <XIcon />
        </button>
      </Show>
    </div>
  );
};

export interface ChipGroupProps {
  children: JSX.Element;
  class?: string;
  gap?: 'sm' | 'md' | 'lg';
}

const gapStyles = {
  sm: 'gap-1',
  md: 'gap-1.5',
  lg: 'gap-2',
};

export const ChipGroup = (props: ChipGroupProps) => {
  const gap = () => props.gap ?? 'md';

  return (
    <div class={cn('flex items-center flex-wrap', gapStyles[gap()], props.class)}>
      {props.children}
    </div>
  );
};
