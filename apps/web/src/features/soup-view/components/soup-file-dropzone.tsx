import { useHandleFileUpload } from '@app/util/handleFileUpload';
import { FileDropOverlay } from '@core/component/FileDropOverlay';
import { fileFolderDrop } from '@core/directive/fileFolderDrop';
import { handleFileFolderDrop } from '@core/util/upload';
import { createSignal, type FlowComponent, Show } from 'solid-js';

false && fileFolderDrop;

export const SoupFileDropzone: FlowComponent = (props) => {
  const [dragging, setDragging] = createSignal(false);
  const handleFileUpload = useHandleFileUpload();
  return (
    <div
      class="relative flex size-full min-h-0 min-w-0 flex-col"
      use:fileFolderDrop={{
        onDrop: (files, folders) => {
          handleFileFolderDrop(files, folders, handleFileUpload);
        },
        onDragStart: () => setDragging(true),
        onDragEnd: () => setDragging(false),
      }}
    >
      <Show when={dragging()}>
        <FileDropOverlay valid>
          Drop any file here to add it to your workspace
        </FileDropOverlay>
      </Show>
      {props.children}
    </div>
  );
};
