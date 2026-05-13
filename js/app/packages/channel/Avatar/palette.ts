export type ColorFamily =
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'purple'
  | 'pink'
  | 'yellow'
  | 'teal'
  | 'slate'
  | 'neutral';

export const COLOR_PALETTE: Record<ColorFamily, { bg: string; fg: string }> = {
  blue: { bg: '#3B82F6', fg: '#FFFFFF' },
  green: { bg: '#10B981', fg: '#FFFFFF' },
  orange: { bg: '#F97316', fg: '#FFFFFF' },
  red: { bg: '#EF4444', fg: '#FFFFFF' },
  purple: { bg: '#8B5CF6', fg: '#FFFFFF' },
  pink: { bg: '#EC4899', fg: '#FFFFFF' },
  yellow: { bg: '#EAB308', fg: '#1F2937' },
  teal: { bg: '#14B8A6', fg: '#FFFFFF' },
  slate: { bg: '#64748B', fg: '#FFFFFF' },
  neutral: { bg: '#1F2937', fg: '#FFFFFF' },
};

export const COLOR_FAMILIES = Object.keys(COLOR_PALETTE) as ColorFamily[];

export const FALLBACK_COLOR: ColorFamily = 'slate';

export function isColorFamily(value: unknown): value is ColorFamily {
  return typeof value === 'string' && value in COLOR_PALETTE;
}
