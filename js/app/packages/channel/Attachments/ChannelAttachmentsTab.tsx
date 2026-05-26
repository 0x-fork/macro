import { Suspense } from 'solid-js';
import { ChannelAttachmentEntitySection } from './ChannelAttachmentEntitySection';
import { ChannelAttachmentMediaSection } from './ChannelAttachmentMediaSection';

export function ChannelAttachmentsTab(props: { channelId: string }) {
  return (
    <div class="relative flex-1 min-h-0 overflow-y-auto">
      <div class="flex h-full min-h-0 w-full flex-col gap-6">
        <Suspense>
          <ChannelAttachmentMediaSection channelId={props.channelId} />
        </Suspense>
        <Suspense>
          <ChannelAttachmentEntitySection channelId={props.channelId} />
        </Suspense>
      </div>
    </div>
  );
}
