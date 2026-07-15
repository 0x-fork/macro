import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createDisclosureState } from './disclosure-state';

describe('createDisclosureState', () => {
  describe('default collapsed (e.g. sub-items)', () => {
    it('starts collapsed and toggles', () => {
      createRoot((dispose) => {
        const d = createDisclosureState();

        expect(d.isExpanded('a')).toBe(false);
        d.toggle('a');
        expect(d.isExpanded('a')).toBe(true);
        d.toggle('a');
        expect(d.isExpanded('a')).toBe(false);

        dispose();
      });
    });

    it('honors initialToggled as expanded', () => {
      createRoot((dispose) => {
        const d = createDisclosureState({ initialToggled: ['a'] });

        expect(d.isExpanded('a')).toBe(true);
        expect(d.isExpanded('b')).toBe(false);

        dispose();
      });
    });

    it('collapseAll clears, expandAll needs the id universe', () => {
      createRoot((dispose) => {
        const d = createDisclosureState();

        d.expandAll(['a', 'b']);
        expect(d.isExpanded('a')).toBe(true);
        expect(d.isExpanded('b')).toBe(true);

        d.collapseAll();
        expect(d.isExpanded('a')).toBe(false);
        expect(d.toggledIds().size).toBe(0);

        dispose();
      });
    });
  });

  describe('default expanded (e.g. groups)', () => {
    it('starts expanded and tracks collapsed ids', () => {
      createRoot((dispose) => {
        const d = createDisclosureState({ defaultExpanded: true });

        expect(d.isExpanded('g1')).toBe(true);
        d.collapse('g1');
        expect(d.isExpanded('g1')).toBe(false);
        expect(d.toggledIds().has('g1')).toBe(true);

        d.expand('g1');
        expect(d.isExpanded('g1')).toBe(true);
        expect(d.toggledIds().has('g1')).toBe(false);

        dispose();
      });
    });

    it('expandAll clears, collapseAll needs the id universe', () => {
      createRoot((dispose) => {
        const d = createDisclosureState({ defaultExpanded: true });

        d.collapseAll(['g1', 'g2']);
        expect(d.isExpanded('g1')).toBe(false);
        expect(d.isExpanded('g2')).toBe(false);

        d.expandAll();
        expect(d.isExpanded('g1')).toBe(true);
        expect(d.toggledIds().size).toBe(0);

        dispose();
      });
    });
  });

  it('setExpanded is idempotent and reset returns to default', () => {
    createRoot((dispose) => {
      const d = createDisclosureState({ defaultExpanded: true });

      d.setExpanded('g1', true); // already default → no exception tracked
      expect(d.toggledIds().size).toBe(0);
      d.setExpanded('g1', false);
      expect(d.toggledIds().has('g1')).toBe(true);
      d.reset();
      expect(d.isExpanded('g1')).toBe(true);
      expect(d.toggledIds().size).toBe(0);

      dispose();
    });
  });
});
