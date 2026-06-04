/**
 * @vitest-environment jsdom
 */

import { render, waitFor } from '@solidjs/testing-library';
import { createSignal, Show } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LazyDecorator } from './LazyDecorator';

let intersect: (() => void) | undefined;

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];

  constructor(private callback: IntersectionObserverCallback) {}

  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();

  observe = vi.fn((target: Element) => {
    intersect = () => {
      this.callback(
        [
          {
            isIntersecting: true,
            target,
          } as IntersectionObserverEntry,
        ],
        this
      );
    };
  });
}

function RemountingLazyDecorator() {
  const [mounted, setMounted] = createSignal(true);

  return (
    <>
      <button type="button" onClick={() => setMounted((value) => !value)}>
        toggle
      </button>
      <Show when={mounted()}>
        <LazyDecorator
          cacheKey="document-mention:doc-1:md:{}"
          placeholder={<span data-testid="mention-placeholder" />}
          render={() => <span data-testid="document-mention">Doc</span>}
        />
      </Show>
    </>
  );
}

describe('LazyDecorator', () => {
  beforeEach(() => {
    intersect = undefined;
    globalThis.IntersectionObserver = TestIntersectionObserver;
  });

  it('does not show the placeholder again after a cached decorator remounts', async () => {
    const { getByRole, queryByTestId } = render(() => (
      <RemountingLazyDecorator />
    ));

    expect(queryByTestId('mention-placeholder')).toBeTruthy();
    expect(queryByTestId('document-mention')).toBeNull();

    intersect?.();
    await waitFor(() => expect(queryByTestId('document-mention')).toBeTruthy());
    expect(queryByTestId('mention-placeholder')).toBeNull();

    getByRole('button').click();
    getByRole('button').click();

    expect(queryByTestId('document-mention')).toBeTruthy();
    expect(queryByTestId('mention-placeholder')).toBeNull();
  });
});
