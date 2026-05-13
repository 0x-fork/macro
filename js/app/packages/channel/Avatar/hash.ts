import { COLOR_FAMILIES, FALLBACK_COLOR, type ColorFamily } from './palette';

function djb2(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return h >>> 0;
}

export function deterministicColorFromName(name: string): ColorFamily {
  const trimmed = name.trim();
  if (!trimmed) return FALLBACK_COLOR;
  return COLOR_FAMILIES[djb2(trimmed.toLowerCase()) % COLOR_FAMILIES.length];
}
