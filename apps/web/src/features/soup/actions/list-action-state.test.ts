import {
  createListState,
  createStaticListDataSource,
} from '@app/components/list';
import type { SoupEntityRow, SoupRow } from '@app/features/soup/collection';
import type { EntityData } from '@entity';
import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { getSelectedEntities } from './list-action-state';

describe('Soup action list state', () => {
  it('deduplicates selected occurrences by canonical entity id', () => {
    const entity = {
      id: 'entity-1',
      type: 'document',
    } as unknown as EntityData;
    const rows: SoupEntityRow[] = [
      { id: 'group-a:entity-1', kind: 'entity', entity },
      { id: 'group-b:entity-1', kind: 'entity', entity },
    ];
    const fixture = createRoot((dispose) => {
      const list = createListState<SoupRow>({
        dataSource: createStaticListDataSource(() => rows),
      });
      return { dispose, list };
    });

    fixture.list.selection.select(rows[0]);
    fixture.list.selection.select(rows[1]);

    expect(getSelectedEntities(fixture.list)).toEqual([entity]);
    fixture.dispose();
  });
});
