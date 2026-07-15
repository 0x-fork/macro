import type { EntityData } from '@entity';
import { describe, expect, it } from 'vitest';
import { testFacets } from '../facet-store';
import { SEARCH_TYPE } from './search';

const entity = (type: EntityData['type']): EntityData =>
  ({ id: `${type}-1`, type }) as EntityData;

describe('SEARCH_TYPE client predicates', () => {
  it('keeps channel messages and threads in channel searches', () => {
    const selection = { 'search-type': ['channels'] };

    expect(
      testFacets(selection, [SEARCH_TYPE], entity('channel_message'), {})
    ).toBe(true);
    expect(
      testFacets(selection, [SEARCH_TYPE], entity('channel_thread'), {})
    ).toBe(true);
    expect(testFacets(selection, [SEARCH_TYPE], entity('document'), {})).toBe(
      false
    );
  });

  it('keeps only projects in folder searches', () => {
    const selection = { 'search-type': ['folders'] };

    expect(testFacets(selection, [SEARCH_TYPE], entity('project'), {})).toBe(
      true
    );
    expect(testFacets(selection, [SEARCH_TYPE], entity('document'), {})).toBe(
      false
    );
  });
});
