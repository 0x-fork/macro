import { describe, expect, it } from 'vitest';
import {
  isPreviewControllerContent,
  previewControllerWidthForContent,
} from '../previewController';
import { splitMinWidthForContent } from '../splitContentSizing';

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
    // The list panel doubles as the app's nav (view pills switch its content
    // in place), so a per-view width would make the panel jump on a switch.
    for (const id of ['inbox', 'channels', 'mail', 'companies', 'documents']) {
      expect(previewControllerWidthForContent({ type: 'component', id })).toBe(
        440
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
    ).toBe(440);
  });

  it('uses the list-view minimum width with a 400px default', () => {
    expect(splitMinWidthForContent({ type: 'component', id: 'channels' })).toBe(
      340
    );
    expect(splitMinWidthForContent({ type: 'component', id: 'inbox' })).toBe(
      340
    );
    expect(splitMinWidthForContent({ type: 'component', id: 'settings' })).toBe(
      400
    );
    expect(splitMinWidthForContent({ type: 'md', id: 'doc-1' })).toBe(400);
  });
});
