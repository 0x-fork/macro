import { Actions } from './Actions';
import { Attachments } from './Attachments';
import { DropOverlay } from './DropOverlay';
import { DropZone } from './DropZone';
import { Editor } from './Editor';
import { EditorShell } from './EditorShell';
import { Footer } from './Footer';
import { FormatRibbon } from './FormatRibbon';
import {
  AttachFilesAction,
  AttachNativeMediaAction,
  CloseReplyAction,
  DiscardDraftAction,
  EmojiAction,
  ToggleFormatAction,
} from './InputActions';
import { Layout } from './Layout';
import { Root } from './Root';
import { SendAction } from './SendAction';

export const Input = {
  Root,
  Layout,
  DropOverlay,
  DropZone,
  FormatRibbon,
  EditorShell,
  Editor,
  Attachments,
  Footer,
  Actions,
  AttachFilesAction,
  AttachNativeMediaAction,
  ToggleFormatAction,
  EmojiAction,
  CloseReplyAction,
  DiscardDraftAction,
  SendAction,
};
