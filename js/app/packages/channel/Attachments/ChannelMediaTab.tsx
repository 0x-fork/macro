import { createMemo, createSignal, onCleanup, Show, Suspense } from 'solid-js';
import { VList } from 'virtua/solid';
import { MediaViewerDialog } from '@channel/Media/MediaViewerDialog';
import {
  flattenAttachments,
  useChannelMediaAttachmentsQuery,
  type ChannelAttachmentsData,
} from '@queries/channel/channel-attachments';
import { type MediaItem, mapMediaItems } from '@channel/Media/media-items';
import { THUMB_SIZE_EXPANDED } from './attachment-utils';
import { cn } from '@ui/utils/classname';

const TILE_SIZE = THUMB_SIZE_EXPANDED;
const GAP = 6;

function MediaTile(props: { item: MediaItem; onClick: () => void }) {
  return (
    <div class="aspect-square overflow-hidden rounded-lg border border-edge">
      <Show
        when={props.item.kind === 'image'}
        fallback={
          <div class="relative w-full h-full group bg-menu">
            <video
              class="w-full h-full object-cover"
              preload="metadata"
              playsinline
              muted
              src={props.item.src}
              onClick={props.onClick}
              onLoadedMetadata={(e) => {
                e.currentTarget.currentTime = 0.001;
              }}
            />
            <div
              class="absolute inset-0 flex items-center justify-center bg-ink/20 cursor-pointer"
              onClick={props.onClick}
            >
              <div class="size-8 rounded-full bg-page/80 flex items-center justify-center">
                <div class="w-0 h-0 border-t-4 border-t-transparent border-l-6 border-l-ink border-b-4 border-b-transparent ml-0.5" />
              </div>
            </div>
          </div>
        }
      >
        <img
          src={props.item.src}
          class={cn('w-full h-full select-none object-cover hover:opacity-80 cursor-pointer')}
          onClick={props.onClick}
          loading="lazy"
          alt=""
        />
      </Show>
    </div>
  );
}

export function ChannelMediaTab(props: { channelId: string }) {
  const [lightboxIndex, setLightboxIndex] = createSignal(0);
  const [viewerOpen, setViewerOpen] = createSignal(false);
  const [containerWidth, setContainerWidth] = createSignal(0);

  const attachmentsQuery = useChannelMediaAttachmentsQuery(
    () => props.channelId
  );

  const items = createMemo<MediaItem[]>((previous = []) =>
    mapMediaItems(
      flattenAttachments(
        attachmentsQuery.data as ChannelAttachmentsData | undefined
      ),
      previous
    )
  );

  const hasMedia = () => items().length > 0;

  const columnsCount = () => {
    const width = containerWidth();
    if (width <= 0) return 3;
    return Math.max(1, Math.floor((width + GAP) / (TILE_SIZE + GAP)));
  };

  const rows = createMemo(() => {
    const cols = columnsCount();
    const allItems = items();
    const result: { items: MediaItem[]; startIndex: number }[] = [];
    for (let i = 0; i < allItems.length; i += cols) {
      result.push({ items: allItems.slice(i, i + cols), startIndex: i });
    }
    return result;
  });

  const observeContainer = (el: HTMLDivElement) => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  };

  const handleScrollEnd = () => {
    if (attachmentsQuery.hasNextPage && !attachmentsQuery.isFetchingNextPage) {
      attachmentsQuery.fetchNextPage();
    }
  };

  return (
    <Suspense fallback={<div class="py-3 text-sm text-ink-muted">Loading...</div>}>
      <div class="h-full flex flex-col" ref={observeContainer}>
        <Show when={!hasMedia() && !attachmentsQuery.isLoading}>
          <div class="py-3 text-sm text-ink-faint">
            No photos or videos in this channel yet.
          </div>
        </Show>

        <Show when={hasMedia()}>
          <div class="flex-1">
            <VList
              data={rows()}
              onScrollEnd={handleScrollEnd}
              class="h-full"
            >
              {(row) => (
                <div
                  class="grid gap-1.5 pb-1.5"
                  style={{
                    'grid-template-columns': `repeat(${columnsCount()}, minmax(0, 1fr))`,
                  }}
                >
                  {row.items.map((item, colIndex) => (
                    <MediaTile
                      item={item}
                      onClick={() => {
                        setLightboxIndex(row.startIndex + colIndex);
                        setViewerOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </VList>
          </div>
          <Show when={attachmentsQuery.isFetchingNextPage}>
            <div class="py-2 text-center text-sm text-ink-muted">Loading...</div>
          </Show>
          <MediaViewerDialog
            items={() => items()}
            open={viewerOpen()}
            onOpenChange={setViewerOpen}
            currentIndex={lightboxIndex}
            onCurrentIndexChange={setLightboxIndex}
          />
        </Show>
      </div>
    </Suspense>
  );
}
