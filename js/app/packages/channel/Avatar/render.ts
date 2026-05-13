import { deterministicColorFromName } from './hash';
import { getIconBody, PHOSPHOR_VIEWBOX } from './icons';
import { COLOR_PALETTE, isColorFamily } from './palette';

export type ChannelAvatarInput = {
  avatarIcon?: string | null;
  avatarColorFamily?: string | null;
  name: string;
};

const ICON_SCALE = 0.7;

export function renderAvatarSvg(
  channel: ChannelAvatarInput,
  size: number = 64
): string {
  const colorKey = isColorFamily(channel.avatarColorFamily)
    ? channel.avatarColorFamily
    : deterministicColorFromName(channel.name);

  const { bg, fg } = COLOR_PALETTE[colorKey];
  const body = getIconBody(channel.avatarIcon);

  const iconBox = size * ICON_SCALE;
  const scale = iconBox / PHOSPHOR_VIEWBOX;
  const offset = (size - iconBox) / 2;

  const cx = size / 2;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%">` +
    `<circle cx="${cx}" cy="${cx}" r="${cx}" fill="${bg}"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="${fg}">` +
    body +
    `</g>` +
    `</svg>`
  );
}
