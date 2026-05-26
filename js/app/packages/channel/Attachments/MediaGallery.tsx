import { MediaGrid } from '@channel/Media/MediaGrid';
import { MediaViewerDialog } from '@channel/Media/MediaViewerDialog';
import type { MediaItem } from '@channel/Media/media-items';
import ChevronDownIcon from '@phosphor/caret-down.svg';
import { createSignal, createUniqueId, onCleanup, Show } from 'solid-js';
import { THUMB_SIZE, THUMB_SIZE_EXPANDED } from './attachment-utils';
import { AttachmentSection, LoadMoreButton } from './SectionHeader';

export function MediaGallery(props: {
  items: MediaItem[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const [lightboxIndex, setLightboxIndex] = createSignal(0);
  const [viewerOpen, setViewerOpen] = createSignal(false);

  const galleryId = createUniqueId();
  const [expanded, setExpanded] = createSignal(false);
  const [containerWidth, setContainerWidth] = createSignal(0);

  const observeGrid = (el: HTMLDivElement) => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  };

  const hasMedia = () => props.items.length > 0;
  const collapsedRowCount = 2;
  const gap = 6;
  const thumbSize = () => expanded() ? THUMB_SIZE_EXPANDED : THUMB_SIZE;

  const columnsCount = () => {
    const width = containerWidth();
    if (width <= 0) return 1;
    return Math.floor((width + gap) / (thumbSize() + gap));
  };

  const actualTileSize = () => {
    const cols = columnsCount();
    const totalGap = (cols - 1) * gap;
    return (containerWidth() - totalGap) / cols;
  };

  const collapsedItemCount = () => columnsCount() * collapsedRowCount;
  const hiddenCount = () => Math.max(0, props.items.length - collapsedItemCount());
  const collapsedMaxHeight = () => actualTileSize() * collapsedRowCount + gap * (collapsedRowCount - 1);

  return (
    <AttachmentSection
      label="Photos and Videos"
      action={
        <Show when={hiddenCount() > 0}>
          <button
            type="button"
            class="flex items-center gap-1 text-xs font-medium text-ink-muted/70 hover:text-ink-muted transition-colors"
            aria-controls={galleryId}
            aria-expanded={expanded()}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded() ? 'Show less' : 'See all'}
            <ChevronDownIcon
              aria-hidden="true"
              class="w-3 h-3 transition-transform"
              classList={{ 'rotate-180': expanded() }}
            />
          </button>
        </Show>
      }
    >
      <div class="grid py-2 px-6">
        <Show when={!hasMedia()}>
          <div class="py-3 text-sm text-ink-faint">
            No photos or videos in this channel yet.
          </div>
        </Show>

        <Show when={hasMedia()}>
          <div>
            <div
              id={galleryId}
              aria-label="Photos and videos gallery"
              data-expanded={expanded() ? 'true' : 'false'}
              class="overflow-hidden transition-[max-height] duration-200"
              style={{
                'max-height': expanded() ? 'none' : `${collapsedMaxHeight()}px`,
              }}
              ref={observeGrid}
            >
              <MediaGrid
                items={props.items}
                variant="attachments"
                tileSize={thumbSize()}
                onOpen={(index) => {
                  setLightboxIndex(index);
                  setViewerOpen(true);
                }}
              />
            </div>
            <MediaViewerDialog
              items={() => props.items}
              open={viewerOpen()}
              onOpenChange={setViewerOpen}
              currentIndex={lightboxIndex}
              onCurrentIndexChange={setLightboxIndex}
            />
          </div>
        </Show>

        <Show when={props.hasNextPage}>
          <LoadMoreButton
            onLoadMore={props.onLoadMore}
            isFetching={() => props.isFetchingNextPage}
          />
        </Show>
      </div>
    </AttachmentSection>
  );
}
