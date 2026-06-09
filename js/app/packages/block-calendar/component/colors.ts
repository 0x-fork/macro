import type { EventColor } from '../model/types';

/**
 * Static class strings per accent color. They must be full literals (not
 * interpolated) so Tailwind's scanner keeps them. Event color-coding is
 * inherently multi-hue, so this is a deliberate, contained use of raw palette
 * classes rather than semantic tokens.
 */
export const EVENT_COLOR_CLASSES: Record<
  EventColor,
  { block: string; dot: string; swatch: string }
> = {
  blue: {
    block: 'bg-blue-500/15 border-l-2 border-blue-500 text-ink',
    dot: 'bg-blue-500',
    swatch: 'bg-blue-500',
  },
  green: {
    block: 'bg-green-500/15 border-l-2 border-green-500 text-ink',
    dot: 'bg-green-500',
    swatch: 'bg-green-500',
  },
  purple: {
    block: 'bg-purple-500/15 border-l-2 border-purple-500 text-ink',
    dot: 'bg-purple-500',
    swatch: 'bg-purple-500',
  },
  orange: {
    block: 'bg-orange-500/15 border-l-2 border-orange-500 text-ink',
    dot: 'bg-orange-500',
    swatch: 'bg-orange-500',
  },
  red: {
    block: 'bg-red-500/15 border-l-2 border-red-500 text-ink',
    dot: 'bg-red-500',
    swatch: 'bg-red-500',
  },
  pink: {
    block: 'bg-pink-500/15 border-l-2 border-pink-500 text-ink',
    dot: 'bg-pink-500',
    swatch: 'bg-pink-500',
  },
};
