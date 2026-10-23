import type { FileDownloadController } from '@core/util/createFileDownload';
import { fireAndForget } from '@core/util/fireAndForget';
import DownloadIcon from '@phosphor/download-simple.svg';
import ShareIcon from '@phosphor/export.svg';
import SpinnerIcon from '@phosphor/spinner.svg';
import { Button } from '@ui';
import { Show } from 'solid-js';

export function FileDownloadButton(props: {
  download: FileDownloadController;
}) {
  const preparing = () => {
    const { loaded, total } = props.download.progress();
    return total > 0
      ? `Preparing ${Math.min(100, Math.round((loaded / total) * 100))}%`
      : 'Preparing…';
  };
  const saveBusy = () =>
    props.download.busy() && props.download.action() === 'save';
  const shareBusy = () =>
    props.download.busy() && props.download.action() === 'share';
  return (
    <>
      <Show when={!props.download.busy() || props.download.action() === 'save'}>
        <Button
          variant="ghost"
          size="md"
          disabled={props.download.busy()}
          onClick={() => fireAndForget(props.download.start(), 'file-download')}
        >
          <Show when={saveBusy()} fallback={<DownloadIcon />}>
            <SpinnerIcon class="animate-spin" />
          </Show>
          {saveBusy()
            ? preparing()
            : props.download.phase() === 'error' &&
                props.download.action() === 'save'
              ? 'Retry download'
              : props.download.phase() === 'ready' &&
                  props.download.action() === 'save'
                ? 'Save file'
                : 'Download'}
        </Button>
      </Show>
      <Show
        when={
          props.download.canOfferShare() &&
          (!props.download.busy() || props.download.action() === 'share')
        }
      >
        <Button
          variant="ghost"
          size="md"
          disabled={props.download.busy()}
          onClick={() =>
            fireAndForget(props.download.start('share'), 'file-download')
          }
        >
          <Show when={shareBusy()} fallback={<ShareIcon />}>
            <SpinnerIcon class="animate-spin" />
          </Show>
          {shareBusy() ? preparing() : 'Share'}
        </Button>
      </Show>
      <Show when={props.download.busy()}>
        <Button variant="ghost" size="md" onClick={props.download.cancel}>
          Cancel
        </Button>
      </Show>
    </>
  );
}
