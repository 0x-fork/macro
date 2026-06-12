// Import node classes from their individual modules (not the @lexical-core
// barrel) so this boot-path module doesn't drag node-list/@lexical/table,
// CustomCodeNode/prismjs and the transformers into the initial bundle.
import { clearDecorators, setDecorator } from '@lexical-core/decoratorRegistry';
import { AwaitNode } from '@lexical-core/nodes/AwaitNode';
import { ContactMentionNode } from '@lexical-core/nodes/ContactMentionNode';
import { DateMentionNode } from '@lexical-core/nodes/DateMentionNode';
import { DiffInsertNode } from '@lexical-core/nodes/DiffInsertNode';
import { DocumentCardNode } from '@lexical-core/nodes/DocumentCardNode';
import { DocumentMentionNode } from '@lexical-core/nodes/DocumentMentionNode';
import { EquationNode } from '@lexical-core/nodes/EquationNode';
import { GroupMentionNode } from '@lexical-core/nodes/GroupMentionNode';
import { HorizontalRuleNode } from '@lexical-core/nodes/HorizontalRuleNode';
import { HtmlRenderNode } from '@lexical-core/nodes/HtmlRenderNode';
import { ImageNode } from '@lexical-core/nodes/ImageNode';
import { SnapshotNode } from '@lexical-core/nodes/SnapshotNode';
import { ThemeMentionNode } from '@lexical-core/nodes/ThemeMentionNode';
import { UnknownMentionNode } from '@lexical-core/nodes/UnknownMentionNode';
import { UserMentionNode } from '@lexical-core/nodes/UserMentionNode';
import { VideoNode } from '@lexical-core/nodes/VideoNode';
import { WatermarkNode } from '@lexical-core/nodes/WatermarkNode';
import { Await } from './component/decorator/Await';
import { ContactMention } from './component/decorator/ContactMention';
import { DateMention } from './component/decorator/DateMention';
import { DiffInsert } from './component/decorator/DiffInsert';
import { DocumentCard } from './component/decorator/DocumentCard';
import { DocumentMention } from './component/decorator/DocumentMention';
import { Equation } from './component/decorator/Equation';
import { GroupMention } from './component/decorator/GroupMention';
import { HorizontalRule } from './component/decorator/HorizontalRule';
import { HtmlRender } from './component/decorator/HtmlRender';
import { MarkdownImage } from './component/decorator/MarkdownImage';
import { MarkdownVideo } from './component/decorator/MarkdownVideo';
import { Snapshot } from './component/decorator/Snapshot';
import { ThemeMention } from './component/decorator/ThemeMention';
import { UnknownMention } from './component/decorator/UnknownMention';
import { UserMention } from './component/decorator/UserMention';
import { Watermark } from './component/decorator/Watermark';
import { registerDiffNodeFactory } from './component/dom-factory/diff-factory';

/**
 * This has to run once before any Lexicals mount. Currently imported in index.tsx.
 */
export function initializeLexical() {
  clearDecorators();
  setDecorator(HorizontalRuleNode, HorizontalRule);
  setDecorator(UserMentionNode, UserMention);
  setDecorator(GroupMentionNode, GroupMention);
  setDecorator(DocumentMentionNode, DocumentMention);
  setDecorator(DocumentCardNode, DocumentCard);
  setDecorator(ContactMentionNode, ContactMention);
  setDecorator(DateMentionNode, DateMention);
  setDecorator(DiffInsertNode, DiffInsert);
  setDecorator(ImageNode, MarkdownImage);
  setDecorator(VideoNode, MarkdownVideo);
  setDecorator(EquationNode, Equation);
  setDecorator(SnapshotNode, Snapshot);
  setDecorator(HtmlRenderNode, HtmlRender);
  setDecorator(ThemeMentionNode, ThemeMention);
  setDecorator(UnknownMentionNode, UnknownMention);
  setDecorator(WatermarkNode, Watermark);
  setDecorator(AwaitNode, Await);
  registerDiffNodeFactory();
}
