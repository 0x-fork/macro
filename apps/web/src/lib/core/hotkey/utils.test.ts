import { describe, expect, test } from 'vitest';
import { activeScope, setActiveScope } from './state';
import type { HotkeyToken } from './tokens';
import type { HotkeyCommand } from './types';
import {
  registerScope,
  removeCommandsFromTokenMap,
  removeScope,
  syncActiveScopeToElement,
} from './utils';

const makeCommand = (token: HotkeyToken | undefined): HotkeyCommand =>
  ({
    hotkeyToken: token,
    scopeId: 'test-scope',
  }) as HotkeyCommand;

describe('removeCommandsFromTokenMap', () => {
  test('removes command from token map', () => {
    const cmd1 = makeCommand('hotkey:test' as HotkeyToken);
    const cmd2 = makeCommand('hotkey:test' as HotkeyToken);
    const map = new Map([[cmd1.hotkeyToken!, [cmd1, cmd2]]]);

    const result = removeCommandsFromTokenMap(map, [cmd1]);

    expect(result.get(cmd1.hotkeyToken!)).toEqual([cmd2]);
  });

  test('deletes entry when last command removed', () => {
    const cmd = makeCommand('hotkey:test' as HotkeyToken);
    const map = new Map([[cmd.hotkeyToken!, [cmd]]]);

    const result = removeCommandsFromTokenMap(map, [cmd]);

    expect(result.has(cmd.hotkeyToken!)).toBe(false);
  });

  test('returns same map reference when nothing to remove', () => {
    const map = new Map<HotkeyToken, HotkeyCommand[]>();

    const result = removeCommandsFromTokenMap(map, []);

    expect(result).toBe(map);
  });

  test('returns same map reference when command not found', () => {
    const cmd1 = makeCommand('hotkey:test' as HotkeyToken);
    const cmd2 = makeCommand('hotkey:test' as HotkeyToken);
    const map = new Map([[cmd1.hotkeyToken!, [cmd1]]]);

    const result = removeCommandsFromTokenMap(map, [cmd2]);

    expect(result).toBe(map);
  });

  test('skips commands without hotkeyToken', () => {
    const cmdWithToken = makeCommand('hotkey:test' as HotkeyToken);
    const cmdWithoutToken = makeCommand(undefined);
    const map = new Map([[cmdWithToken.hotkeyToken!, [cmdWithToken]]]);

    const result = removeCommandsFromTokenMap(map, [cmdWithoutToken]);

    expect(result).toBe(map);
    expect(result.get(cmdWithToken.hotkeyToken!)).toEqual([cmdWithToken]);
  });

  test('removes multiple commands with different tokens', () => {
    const cmd1 = makeCommand('hotkey:a' as HotkeyToken);
    const cmd2 = makeCommand('hotkey:b' as HotkeyToken);
    const cmd3 = makeCommand('hotkey:a' as HotkeyToken);
    const map = new Map<HotkeyToken, HotkeyCommand[]>([
      [cmd1.hotkeyToken!, [cmd1, cmd3]],
      [cmd2.hotkeyToken!, [cmd2]],
    ]);

    const result = removeCommandsFromTokenMap(map, [cmd1, cmd2]);

    expect(result.get('hotkey:a' as HotkeyToken)).toEqual([cmd3]);
    expect(result.has('hotkey:b' as HotkeyToken)).toBe(false);
  });
});

describe('syncActiveScopeToElement', () => {
  test('uses the closest registered DOM scope', () => {
    const scopeId = 'test-sync-dom-scope';
    registerScope({ parentScopeId: 'global', scopeId, type: 'dom' });

    const scope = document.createElement('div');
    scope.setAttribute('data-hotkey-scope', scopeId);
    const target = document.createElement('button');
    scope.append(target);
    document.body.append(scope);

    syncActiveScopeToElement(target);

    expect(activeScope()).toBe(scopeId);

    setActiveScope('global');
    removeScope(scopeId);
    scope.remove();
  });

  test('falls back to the global scope when no registered scope contains the element', () => {
    const target = document.createElement('div');
    target.setAttribute('data-hotkey-scope', 'missing-scope');

    syncActiveScopeToElement(target);

    expect(activeScope()).toBe('global');
  });
});
