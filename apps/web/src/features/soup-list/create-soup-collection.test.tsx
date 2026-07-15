import type { EntityData } from '@entity';
import { render, screen } from '@solidjs/testing-library';
import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { SoupCollectionProvider, useSoupCollection } from './context';
import type { SoupCollection } from './create-soup-collection';
import { createSoupCollectionState } from './create-soup-collection-state';

const sortConfigs = {
  name: {
    id: 'name',
    fn: (a: EntityData, b: EntityData) => a.id.localeCompare(b.id),
  },
  updated: {
    id: 'updated',
    fn: () => 0,
  },
};

function createTestCollection() {
  return createSoupCollectionState({
    initialFacets: {
      type: ['doc-canvas'],
      'email-inbox': ['inbox-1'],
    },
    sortConfigs,
    initialSortIds: ['name'],
    initialGroupBy: 'date',
    initialCollapsedGroups: ['today'],
    initialSearch: 'initial search',
    initialActiveTab: 'owned',
  });
}

describe('createSoupCollectionState', () => {
  it('creates facet, sort, grouping, search, and view state', () => {
    createRoot((dispose) => {
      const collection = createTestCollection();

      expect(collection.facets.serialize()).toEqual({
        'email-inbox': ['inbox-1'],
        type: ['doc-canvas'],
      });
      expect(collection.facets.getSelected('email-inbox')).toEqual(['inbox-1']);
      expect(collection.sort().map((sort) => sort.id)).toEqual(['name']);
      expect(collection.groupBy()).toBe('date');
      expect(collection.disclosure.isExpanded('today')).toBe(false);
      expect(collection.search()).toBe('initial search');
      expect(collection.activeTab()).toBe('owned');
      dispose();
    });
  });

  it('resets controls to their initial values', () => {
    createRoot((dispose) => {
      const collection = createTestCollection();

      collection.facets.toggle('type', 'doc-canvas');
      collection.facets.toggle('type', 'doc-markdown');
      collection.setSort([{ id: 'updated', reversed: false }]);
      collection.setGroupBy('project');
      collection.disclosure.expand('today');
      collection.disclosure.collapse('later');
      collection.setSearch('changed');
      collection.setActiveTab('changed');

      collection.reset();

      expect(collection.facets.getSelected('type')).toEqual(['doc-canvas']);
      expect(collection.sort().map((sort) => sort.id)).toEqual(['name']);
      expect(collection.groupBy()).toBe('date');
      expect(collection.disclosure.isExpanded('today')).toBe(false);
      expect(collection.disclosure.isExpanded('later')).toBe(true);
      expect(collection.search()).toBe('initial search');
      expect(collection.activeTab()).toBe('owned');
      dispose();
    });
  });

  it('provides collection controls to composed components', () => {
    function Consumer() {
      const current = useSoupCollection();
      return <div>{current.search()}</div>;
    }

    function TestRoot() {
      const collection = createTestCollection();
      return (
        <SoupCollectionProvider value={collection as SoupCollection}>
          <Consumer />
        </SoupCollectionProvider>
      );
    }

    render(() => <TestRoot />);

    expect(screen.getByText('initial search')).toBeTruthy();
  });
});
