import { describe, expect, it } from 'vitest';
import { macroAppLinkToInternalPath } from './navigation';

describe('macroAppLinkToInternalPath', () => {
  it('converts app links to internal router paths', () => {
    expect(
      macroAppLinkToInternalPath(
        'https://macro.com/app/task/019f7009-4645-763a-9a97-d2411da16659'
      )
    ).toBe('/task/019f7009-4645-763a-9a97-d2411da16659');
    expect(macroAppLinkToInternalPath('https://macro.com/app/md/doc123')).toBe(
      '/md/doc123'
    );
  });

  it('preserves query params', () => {
    expect(
      macroAppLinkToInternalPath(
        'https://macro.com/app/channel/abc?message=def&thread=ghi'
      )
    ).toBe('/channel/abc?message=def&thread=ghi');
  });

  it('handles the bare /app path', () => {
    expect(macroAppLinkToInternalPath('https://macro.com/app')).toBe('/');
    expect(macroAppLinkToInternalPath('https://macro.com/app/')).toBe('/');
  });

  it('converts dev and staging hosts', () => {
    expect(
      macroAppLinkToInternalPath('https://dev.macro.com/app/task/123')
    ).toBe('/task/123');
    expect(
      macroAppLinkToInternalPath('https://staging.macro.com/app/task/123')
    ).toBe('/task/123');
  });

  it('ignores non-app paths on macro.com', () => {
    expect(macroAppLinkToInternalPath('https://macro.com/')).toBeNull();
    expect(
      macroAppLinkToInternalPath('https://macro.com/blog/post')
    ).toBeNull();
    // "/apple" must not match the "/app" prefix
    expect(macroAppLinkToInternalPath('https://macro.com/apple')).toBeNull();
  });

  it('ignores other hosts', () => {
    expect(
      macroAppLinkToInternalPath('https://example.com/app/task/123')
    ).toBeNull();
    expect(
      macroAppLinkToInternalPath('https://evil-macro.com/app/task/123')
    ).toBeNull();
    expect(
      macroAppLinkToInternalPath('https://sub.macro.com/app/task/123')
    ).toBeNull();
  });

  it('ignores non-http(s) schemes and invalid urls', () => {
    expect(macroAppLinkToInternalPath('mailto:someone@macro.com')).toBeNull();
    expect(
      macroAppLinkToInternalPath('tauri://localhost/app/task/123')
    ).toBeNull();
    expect(macroAppLinkToInternalPath('/app/task/123')).toBeNull();
    expect(macroAppLinkToInternalPath('not a url')).toBeNull();
  });
});
