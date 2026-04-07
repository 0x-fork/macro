import { DocumentBlockContainer } from '@core/component/DocumentBlockContainer';
import { useBlockEntityCommands } from '@app/component/next-soup/actions';
import { toast } from 'core/component/Toast/Toast';
import { Show } from 'solid-js';
import { blockData } from '../signal/blockData';
import { ModalsProvider } from './ModalsProvider';
import { TopBar } from './TopBar';

export default function BlockVideo() {
  useBlockEntityCommands();

  return (
    <DocumentBlockContainer>
      <div class="w-full h-full bg-panel select-none overscroll-none overflow-hidden flex flex-col relative">
        <ModalsProvider>
          <div class="relative">
            <TopBar />
          </div>
          <div class="w-full grow-1 relative overflow-hidden">
            <Media />
          </div>
        </ModalsProvider>
      </div>
    </DocumentBlockContainer>
  );
}

const Media = () => {
  const mediaUrl = () => blockData()?.videoUrl;
  const fileType = () => blockData()?.documentMetadata?.fileType;
  const isAudio = () => fileType() === 'mp3';

  const handleError = () => {
    toast.failure('Media playback failed');
  };

  return (
    <div class="w-full h-full flex flex-col items-center justify-center gap-3 text-ink">
      <Show when={mediaUrl()}>
        <Show
          when={isAudio()}
          fallback={
            <video
              class="w-full h-full"
              controls
              autoplay
              src={mediaUrl()}
              onError={handleError}
            />
          }
        >
          <audio class="w-full max-w-[720px]" controls autoplay src={mediaUrl()} onError={handleError} />
        </Show>
      </Show>
    </div>
  );
};
