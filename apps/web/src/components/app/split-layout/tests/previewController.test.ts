import { describe, expect, it } from 'vitest';
import {
  isPreviewControllerContent,
  previewControllerWidthForContent,
} from '../previewController';
import {
  DEFAULT_SPLIT_MIN_WIDTH,
  splitMinWidthForContent,
} from '../splitContentSizing';

describe('preview controller content', () => {
  it('explicitly recognizes configured content', () => {
    expect(isPreviewControllerContent({ type: 'component', id: 'inbox' })).toBe(
      true
    );
    expect(
      isPreviewControllerContent({ type: 'component', id: 'settings' })
    ).toBe(false);
    expect(isPreviewControllerContent({ type: 'md', id: 'doc-1' })).toBe(false);
    expect(
      isPreviewControllerContent({ type: 'project', id: 'project-1' })
    ).toBe(true);
  });

  it('gives every list view the same controller width', () => {
    // The list panel doubles as the app's nav (view rows switch its content
    // in place), so a per-view width would make the panel jump on a switch.
    for (const id of ['inbox', 'channels', 'mail', 'companies', 'documents']) {
      expect(previewControllerWidthForContent({ type: 'component', id })).toBe(
        340
      );
    }
    expect(
      previewControllerWidthForContent({ type: 'component', id: 'settings' })
    ).toBeUndefined();
    expect(
      previewControllerWidthForContent({
        type: 'project',
        id: 'project-1',
      })
    ).toBe(340);
  });

  it('uses the configured list-view minimum only for Preview Controllers', () => {
    const previewController = { isPreviewController: true };
    const standaloneSplit = { isPreviewController: false };
    const listViewContent = { type: 'component' as const, id: 'inbox' };

    expect(splitMinWidthForContent(listViewContent, previewController)).toBe(
      240
    );
    expect(splitMinWidthForContent(listViewContent, standaloneSplit)).toBe(
      DEFAULT_SPLIT_MIN_WIDTH
    );
    expect(
      splitMinWidthForContent(
        { type: 'component', id: 'settings' },
        previewController
      )
    ).toBe(DEFAULT_SPLIT_MIN_WIDTH);
    expect(
      splitMinWidthForContent({ type: 'md', id: 'doc-1' }, previewController)
    ).toBe(DEFAULT_SPLIT_MIN_WIDTH);
  });
});
