/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { MediaGrid } from '../MediaGrid';
import type { MediaItem } from '../media-items';

vi.mock(
  '@phosphor-icons/core/bold/spinner-gap-bold.svg?component-solid',
  () => ({
    default: () => <span data-testid="spinner-icon" />,
  })
);

function mediaItem(
  kind: MediaItem['kind'],
  width: number,
  height: number
): MediaItem {
  return {
    id: `${kind}-id`,
    kind,
    src: `https://static.example/${kind}-id`,
    fullSrc: `https://static.example/${kind}-id`,
    width,
    height,
  };
}

describe('message media layout', () => {
  it('reserves the constrained image dimensions on a persistent frame', () => {
    render(() => (
      <MediaGrid
        items={[mediaItem('image', 800, 600)]}
        variant="message"
        onOpen={vi.fn()}
      />
    ));

    const frame = screen.getByRole('button', {
      name: 'Open image viewer',
    });
    const image = screen.getByAltText('preview');
    const frameStyleBeforeLoad = frame.getAttribute('style');

    expect(frame.style.width).toBe('400px');
    expect(frame.style.maxWidth).toBe('100%');
    expect(frame.style.aspectRatio).toBe('400 / 300');
    expect(image.classList).toContain('size-full');
    expect(
      screen.getByTestId('spinner-icon').parentElement?.classList
    ).toContain('size-full');

    fireEvent.load(image);

    expect(frame.isConnected).toBe(true);
    expect(frame.getAttribute('style')).toBe(frameStyleBeforeLoad);
    expect(screen.queryByTestId('spinner-icon')).toBeNull();
  });

  it('reserves the constrained video dimensions before metadata loads', () => {
    render(() => (
      <MediaGrid
        items={[mediaItem('video', 1920, 1080)]}
        variant="message"
        onOpen={vi.fn()}
      />
    ));

    const video = document.querySelector('video');
    const frame = video?.closest('[data-message-media-frame="video"]');
    if (!video || !(frame instanceof HTMLElement)) {
      throw new Error('Expected the video to render inside a media frame');
    }
    const frameStyleBeforeMetadata = frame.getAttribute('style');

    expect(frame.style.width).toBe('480px');
    expect(frame.style.maxWidth).toBe('100%');
    expect(frame.style.aspectRatio).toBe('480 / 270');
    expect(video.classList).toContain('size-full');

    fireEvent.loadedMetadata(video);

    expect(frame.isConnected).toBe(true);
    expect(frame.getAttribute('style')).toBe(frameStyleBeforeMetadata);

    fireEvent.click(screen.getByRole('button', { name: 'Play inline' }));

    expect(frame.isConnected).toBe(true);
    expect(frame.getAttribute('style')).toBe(frameStyleBeforeMetadata);
    expect(document.querySelector('video')?.classList).toContain('size-full');
  });
});
