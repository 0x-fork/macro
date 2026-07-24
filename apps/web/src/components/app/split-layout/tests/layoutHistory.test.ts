import { describe, expect, it } from 'vitest';
import { createHistory } from '../history';

describe('createHistory', () => {
  it('should create an empty history', () => {
    const history = createHistory<{ value: string }>();
    expect(history.items).toEqual([]);
    expect(history.index).toBe(-1);
    expect(history.canGoBack()).toBe(false);
    expect(history.canGoForward()).toBe(false);
  });

  describe('push', () => {
    it('should add items to history', () => {
      const history = createHistory<{ value: string }>();

      history.push({ value: 'first' });
      expect(history.items).toEqual([{ value: 'first' }]);
      expect(history.index).toBe(0);

      history.push({ value: 'second' });
      expect(history.items).toEqual([{ value: 'first' }, { value: 'second' }]);
      expect(history.index).toBe(1);
    });

    it('should fork from item when not at end of history', () => {
      const history = createHistory<{ value: string }>();

      history.push({ value: 'first' });
      history.push({ value: 'second' });
      history.push({ value: 'third' });
      expect(history.items.length).toBe(3);
      expect(history.index).toBe(2);

      history.back();
      history.back();
      expect(history.items.length).toBe(3);
      expect(history.index).toBe(0);

      history.push({ value: 'new' });
      expect(history.items).toEqual([{ value: 'first' }, { value: 'new' }]);
    });
  });

  describe('back', () => {
    it('should navigate backward in history', () => {
      const history = createHistory<{ value: string }>();

      history.push({ value: 'first' });
      history.push({ value: 'second' });
      history.push({ value: 'third' });

      const result1 = history.back();
      expect(result1).toEqual({ value: 'second' });

      const result2 = history.back();
      expect(result2).toEqual({ value: 'first' });
    });
  });

  describe('forward', () => {
    it('should navigate forward in history', () => {
      const history = createHistory<{ value: string }>();

      history.push({ value: 'first' });
      history.push({ value: 'second' });
      history.push({ value: 'third' });

      history.back();
      history.back();

      const result1 = history.forward();
      expect(result1).toEqual({ value: 'second' });

      const result2 = history.forward();
      expect(result2).toEqual({ value: 'third' });
    });
  });

  describe('canGoBack', () => {
    it('should return false for empty history', () => {
      const history = createHistory<{ value: string }>();
      expect(history.canGoBack()).toBe(false);
    });

    it('should return false when at first item', () => {
      const history = createHistory<{ value: string }>();
      history.push({ value: 'first' });
      expect(history.canGoBack()).toBe(false);
    });

    it('should return true when not at first item', () => {
      const history = createHistory<{ value: string }>();
      history.push({ value: 'first' });
      history.push({ value: 'second' });
      expect(history.canGoBack()).toBe(true);
    });
  });

  describe('canGoForward', () => {
    it('should return false for empty history', () => {
      const history = createHistory<{ value: string }>();
      expect(history.canGoForward()).toBe(false);
    });

    it('should return false when at last item', () => {
      const history = createHistory<{ value: string }>();
      history.push({ value: 'first' });
      history.push({ value: 'second' });
      expect(history.canGoForward()).toBe(false);
    });

    it('should return true when not at last item', () => {
      const history = createHistory<{ value: string }>();
      history.push({ value: 'first' });
      history.push({ value: 'second' });
      history.back();
      expect(history.canGoForward()).toBe(true);
    });
  });

  describe('replaceAt', () => {
    it('should replace an earlier item without moving the index', () => {
      const history = createHistory<{ value: string }>();
      history.push({ value: 'list' });
      history.push({ value: 'entity' });

      history.replaceAt(0, { value: 'list-updated' });

      expect(history.items).toEqual([
        { value: 'list-updated' },
        { value: 'entity' },
      ]);
      expect(history.index).toBe(1);
    });

    it('should survive a merge of the current entry', () => {
      const history = createHistory<{ value: string }>();
      history.push({ value: 'list' });
      history.push({ value: 'entity-a' });

      // Scanning j/k from inside an entity: the list entry is updated, then
      // the current entry is merged in place.
      history.replaceAt(0, { value: 'list-focus-b' });
      history.merge({ value: 'entity-b' });

      expect(history.items).toEqual([
        { value: 'list-focus-b' },
        { value: 'entity-b' },
      ]);
      expect(history.back()).toEqual({ value: 'list-focus-b' });
    });

    it('should ignore out-of-bounds indices', () => {
      const history = createHistory<{ value: string }>();
      history.push({ value: 'first' });

      history.replaceAt(-1, { value: 'nope' });
      history.replaceAt(5, { value: 'nope' });

      expect(history.items).toEqual([{ value: 'first' }]);
      expect(history.index).toBe(0);
    });
  });
});
