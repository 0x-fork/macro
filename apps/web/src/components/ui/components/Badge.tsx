import { type JSX, splitProps } from 'solid-js';
import { cn } from '../utils/classname';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'alert'
  | 'failure'
  | 'note';
export type BadgeVariant = 'soft' | 'outline' | 'solid' | 'ghost';
export type BadgeSize = 'sm' | 'md';
export type BadgeShape = 'rounded' | 'pill';

export type BadgeProps = JSX.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: BadgeSize;
  shape?: BadgeShape;
  mono?: boolean;
  uppercase?: boolean;
};

const BADGE_BASE_CLASS =
  'inline-flex shrink-0 items-center gap-1 font-medium leading-none';

const BADGE_SIZE_CLASS: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-xxs',
  md: 'px-2 py-1 text-xs',
};

const BADGE_SHAPE_CLASS: Record<BadgeShape, string> = {
  rounded: 'rounded-sm',
  pill: 'rounded-full',
};

const BADGE_TONE_CLASS: Record<BadgeTone, Record<BadgeVariant, string>> = {
  neutral: {
    soft: 'bg-hover text-ink-muted',
    outline: 'border border-edge-muted text-ink-muted',
    solid: 'bg-ink-muted text-surface',
    ghost: 'text-ink-muted',
  },
  accent: {
    soft: 'bg-accent/10 text-accent',
    outline: 'border border-accent/20 text-accent',
    solid: 'bg-accent text-surface',
    ghost: 'text-accent',
  },
  success: {
    soft: 'bg-success-bg text-success',
    outline: 'border border-success/20 text-success',
    solid: 'bg-success text-surface',
    ghost: 'text-success',
  },
  alert: {
    soft: 'bg-alert-bg text-alert-ink',
    outline: 'border border-alert/20 text-alert-ink',
    solid: 'bg-alert text-surface',
    ghost: 'text-alert-ink',
  },
  failure: {
    soft: 'bg-failure-bg text-failure-ink',
    outline: 'border border-failure/20 text-failure-ink',
    solid: 'bg-failure text-surface',
    ghost: 'text-failure-ink',
  },
  note: {
    soft: 'bg-note/15 text-note',
    outline: 'border border-note/20 text-note',
    solid: 'bg-note text-surface',
    ghost: 'text-note',
  },
};

export function Badge(props: BadgeProps) {
  const [local, rest] = splitProps(props, [
    'class',
    'tone',
    'variant',
    'size',
    'shape',
    'mono',
    'uppercase',
  ]);
  const tone = () => local.tone ?? 'neutral';
  const variant = () => local.variant ?? 'soft';
  const size = () => local.size ?? 'sm';
  const shape = () => local.shape ?? 'rounded';

  return (
    <span
      class={cn(
        BADGE_BASE_CLASS,
        BADGE_SIZE_CLASS[size()],
        BADGE_SHAPE_CLASS[shape()],
        BADGE_TONE_CLASS[tone()][variant()],
        local.mono && 'font-mono',
        local.uppercase && 'uppercase tracking-wide',
        local.class
      )}
      {...rest}
    />
  );
}
