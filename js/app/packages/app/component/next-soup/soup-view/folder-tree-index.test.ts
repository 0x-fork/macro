import type { Project } from '@service-storage/generated/schemas/project';
import { describe, expect, it } from 'vitest';
import { buildFolderTreeIndex } from './folder-tree-index';

const project = (
  id: string,
  name: string,
  parentId: string | null = null,
  userId = 'user-1'
): Project => ({
  id,
  name,
  parentId,
  type: 'project',
  userId,
});

describe('buildFolderTreeIndex', () => {
  it('builds nested directory paths from parentId links', () => {
    const index = buildFolderTreeIndex([
      project('a', 'Alpha'),
      project('b', 'Beta', 'a'),
      project('c', 'Gamma', 'b'),
    ]);

    expect(index.paths).toEqual(['Alpha/', 'Alpha/Beta/', 'Alpha/Beta/Gamma/']);
    expect(index.idByPath.get('Alpha/Beta/Gamma/')).toBe('c');
    expect(index.pathById.get('b')).toBe('Alpha/Beta/');
  });

  it('sorts siblings by name then id', () => {
    const index = buildFolderTreeIndex([
      project('1', 'zebra'),
      project('2', 'Apple'),
      project('3', 'mango'),
    ]);

    expect(index.paths).toEqual(['Apple/', 'mango/', 'zebra/']);
  });

  it('treats folders with missing parents as roots', () => {
    const index = buildFolderTreeIndex([
      project('a', 'Orphan', 'gone'),
      project('b', 'Root'),
    ]);

    expect(index.paths).toEqual(['Orphan/', 'Root/']);
  });

  it('keeps paths unique when sibling names collide', () => {
    const index = buildFolderTreeIndex([
      project('a1', 'Notes'),
      project('a2', 'Notes'),
      project('a3', 'Notes'),
    ]);

    expect(index.paths).toEqual(['Notes/', 'Notes (2)/', 'Notes (3)/']);
    // Suffixes are assigned in id order, so they are stable across rebuilds.
    expect(index.idByPath.get('Notes/')).toBe('a1');
    expect(index.idByPath.get('Notes (3)/')).toBe('a3');
  });

  it('sanitizes path separators and blank names', () => {
    const index = buildFolderTreeIndex([
      project('a', 'Q3/Q4 Planning'),
      project('b', '   '),
    ]);

    expect(index.paths).toEqual(['Q3∕Q4 Planning/', 'Untitled/']);
    expect(index.idByPath.get('Q3∕Q4 Planning/')).toBe('a');
  });

  it('filters to an owner but keeps ancestors of owned folders', () => {
    const index = buildFolderTreeIndex(
      [
        project('shared-root', 'Team', null, 'someone-else'),
        project('mine', 'Mine', 'shared-root', 'user-1'),
        project('theirs', 'Theirs', 'shared-root', 'someone-else'),
        project('top', 'Top', null, 'user-1'),
      ],
      { ownerId: 'user-1' }
    );

    expect(index.paths).toEqual(['Team/', 'Team/Mine/', 'Top/']);
  });

  it('drops folders trapped in parentId cycles without looping', () => {
    const index = buildFolderTreeIndex([
      project('a', 'A', 'b'),
      project('b', 'B', 'a'),
      project('ok', 'Ok'),
    ]);

    expect(index.paths).toEqual(['Ok/']);
  });
});
