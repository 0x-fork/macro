import CaretRight from '@icon/regular/caret-right.svg';
import { createMemo, Index } from 'solid-js';
import {
  FILE_LIST_CARET_WIDTH,
  FILE_LIST_ROW_HEIGHT,
  FILE_LIST_SPACER_WIDTH,
  type FileListSize,
} from './constants';

function FileLevelSpacer(props: { size: FileListSize }) {
  return (
    <div
      class={`file-level-spacer ${FILE_LIST_SPACER_WIDTH[props.size]} ${FILE_LIST_ROW_HEIGHT[props.size]} border-r-1 border-edge`}
    />
  );
}

type ExplorerSpacerProps = {
  depth?: number;
  size?: FileListSize;
};

export function ExplorerSpacer(props: ExplorerSpacerProps) {
  if (props.depth === undefined) {
    return '';
  }
  const depth = createMemo(() => new Array(props.depth).fill(null));

  return (
    <Index each={depth()}>
      {() => <FileLevelSpacer size={props.size ?? 'sm'} />}
    </Index>
  );
}
