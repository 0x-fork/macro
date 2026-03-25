import { $findMatchingParent } from '@lexical/utils';
import {
  $getNearestNodeFromDOMNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from 'lexical';

type ElementEventProps<T extends LexicalNode, E extends Event> = {
  eventName: string;
  guard: (node: LexicalNode) => node is T;
  callback: (event: E, node: T, key: NodeKey) => void;
};

function registerElementEventPlugin<T extends LexicalNode, E extends Event>(
  editor: LexicalEditor,
  props: ElementEventProps<T, E>
) {
  const eventHandler = (event: Event) => {
    editor.update(() => {
      const nearestNode = $getNearestNodeFromDOMNode(event.target as Element);
      if (nearestNode === null) return;
      if (props.guard(nearestNode)) {
        props.callback(event as E, nearestNode, nearestNode.getKey());
        return;
      }
      let parentTarget = $findMatchingParent(nearestNode, props.guard);
      if (parentTarget === null) return;
      props.callback(event as E, parentTarget, parentTarget.getKey());
    });
  };
  return editor.registerRootListener((root, prevRoot) => {
    if (root) {
      root.addEventListener(props.eventName, eventHandler);
    }
    if (prevRoot) {
      prevRoot.removeEventListener(props.eventName, eventHandler);
    }
  });
}
