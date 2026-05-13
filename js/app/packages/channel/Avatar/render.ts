import { getIconBody, PHOSPHOR_VIEWBOX } from './icons';

export type ChannelAvatarInput = {
  avatarIcon?: string | null;
  /**
   * Persisted with the channel for forward-compat. Not currently rendered —
   * see {@link ChannelAvatar} for the active styling (subtle, theme-driven).
   * Re-enable palette coloring by reintroducing it in renderAvatarSvg.
   */
  avatarColorFamily?: string | null;
  name: string;
};

const ICON_SCALE = 0.7;

export function renderAvatarSvg(
  channel: ChannelAvatarInput,
  size: number = 64
): string {
  const body = getIconBody(channel.avatarIcon);

  const iconBox = size * ICON_SCALE;
  const scale = iconBox / PHOSPHOR_VIEWBOX;
  const offset = (size - iconBox) / 2;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%">` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="currentColor">` +
    body +
    `</g>` +
    `</svg>`
  );
}
