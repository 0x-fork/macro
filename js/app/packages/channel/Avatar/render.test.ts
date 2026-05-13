import { describe, expect, it } from 'vitest';

import { deterministicColorFromName } from './hash';
import { FALLBACK_ICON } from './icons';
import { COLOR_PALETTE } from './palette';
import { renderAvatarSvg } from './render';

describe('renderAvatarSvg', () => {
  it('renders explicit icon + color', () => {
    expect(
      renderAvatarSvg({
        name: 'design-team',
        avatarIcon: 'chat-circle',
        avatarColorFamily: 'purple',
      })
    ).toMatchInlineSnapshot(
      `"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block"><circle cx="32" cy="32" r="32" fill="#8B5CF6"/><g transform="translate(14.399999999999999 14.399999999999999) scale(0.1375)" fill="#FFFFFF"><path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-6.54-.67L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z"/></g></svg>"`
    );
  });

  it('falls back to hash-derived color when avatarColorFamily is null', () => {
    const svg = renderAvatarSvg({ name: 'engineering', avatarIcon: null, avatarColorFamily: null });
    const expectedColor = COLOR_PALETTE[deterministicColorFromName('engineering')].bg;
    expect(svg).toContain(`fill="${expectedColor}"`);
    expect(svg).toContain('<circle');
  });

  it('falls back to FALLBACK_ICON when avatarIcon is unknown', () => {
    const known = renderAvatarSvg({
      name: 'x',
      avatarIcon: FALLBACK_ICON,
      avatarColorFamily: 'slate',
    });
    const unknown = renderAvatarSvg({
      name: 'x',
      avatarIcon: 'not-a-real-icon-name',
      avatarColorFamily: 'slate',
    });
    expect(unknown).toBe(known);
  });

  it('falls back to slate when avatarColorFamily is unknown and name is empty', () => {
    const svg = renderAvatarSvg({ name: '', avatarIcon: null, avatarColorFamily: 'fuchsia' });
    expect(svg).toContain(`fill="${COLOR_PALETTE.slate.bg}"`);
  });

  it('produces the same output for the same name (deterministic)', () => {
    const a = renderAvatarSvg({ name: 'project-falcon', avatarIcon: null, avatarColorFamily: null });
    const b = renderAvatarSvg({ name: 'project-falcon', avatarIcon: null, avatarColorFamily: null });
    expect(a).toBe(b);
  });

  it('scales correctly for custom size', () => {
    const svg = renderAvatarSvg(
      { name: 'design', avatarIcon: 'chat-circle', avatarColorFamily: 'blue' },
      128
    );
    expect(svg).toContain('viewBox="0 0 128 128"');
    expect(svg).toContain('cx="64"');
    expect(svg).toContain('r="64"');
  });
});

describe('deterministicColorFromName', () => {
  it('is stable across calls', () => {
    expect(deterministicColorFromName('marketing')).toBe(
      deterministicColorFromName('marketing')
    );
  });

  it('is case-insensitive', () => {
    expect(deterministicColorFromName('Marketing')).toBe(
      deterministicColorFromName('marketing')
    );
  });

  it('returns slate for empty/whitespace input', () => {
    expect(deterministicColorFromName('')).toBe('slate');
    expect(deterministicColorFromName('   ')).toBe('slate');
  });
});
