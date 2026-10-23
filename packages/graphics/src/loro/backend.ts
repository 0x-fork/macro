import { LoroDoc, type LoroTree, type PeerID, UndoManager } from 'loro-crdt';
import type { GraphicsBackend } from '../core/backend';
import type { GraphicsDocument } from '../core/model';
import { freezeDocument } from '../core/scene';
import { type NodeData, readScene, writeScene } from './scene-mapping';

type Schema = { scene: LoroTree<NodeData> };
type Source = Parameters<Parameters<GraphicsBackend['subscribe']>[0]>[0];
/** Host bookkeeping is durable but must not become a scene undo step. */
export const GRAPHICS_METADATA_ORIGIN = 'graphics:metadata';

// Loro's untyped host document cannot express the scene schema in getTree.
// readScene validates the projection before any data is exposed to the editor.
const sceneTree = (doc: LoroDoc) => doc.getTree('scene') as LoroTree<NodeData>;

export function readLoroGraphicsDocument(doc: LoroDoc, rootId: string) {
  const tree = sceneTree(doc);
  try {
    return readScene(tree, rootId).document;
  } finally {
    tree.free();
  }
}

export function createLoroSeed(seed: GraphicsDocument): Uint8Array {
  const validated = freezeDocument(seed);
  const doc = new LoroDoc<Schema>();
  doc.setPeerId('0');
  const tree = sceneTree(doc);
  tree.enableFractionalIndex(0);
  writeScene(
    tree,
    {
      rootId: seed.rootId,
      items: { [seed.rootId]: { id: seed.rootId, type: 'surface' } },
    },
    validated
  );
  doc.commit();
  const snapshot = doc.export({ mode: 'snapshot' });
  tree.free();
  doc.free();
  return snapshot;
}

/** Experimental Loro owner; no browser, network, storage or Solid dependencies. */
export function createLoroGraphicsBackend(
  snapshot: Uint8Array,
  peerId: PeerID,
  rootId: string
) {
  const doc = new LoroDoc<Schema>();
  doc.import(snapshot);
  doc.setPeerId(peerId);
  return graphicsBackend(doc, rootId, true);
}

/** Bind a scene to a document owned by the host's durable sync runtime. */
export function createLoroGraphicsBackendFromDoc(
  doc: LoroDoc,
  rootId: string,
  canEdit: () => boolean = () => true
) {
  return graphicsBackend(doc, rootId, false, canEdit);
}

function graphicsBackend(
  doc: LoroDoc,
  rootId: string,
  ownsDocument: boolean,
  canEdit: () => boolean = () => true
) {
  const tree = sceneTree(doc);
  tree.enableFractionalIndex(0);
  const history = new UndoManager(doc, {
    mergeInterval: 0,
    maxUndoSteps: 100,
    excludeOriginPrefixes: [GRAPHICS_METADATA_ORIGIN],
  });
  let projection = readScene(tree, rootId);
  let disposed = false;
  const listeners = new Set<(source: Source) => void>();
  const updates = new Set<(bytes: Uint8Array) => void>();
  const refresh = (source: Source) => {
    projection = readScene(tree, rootId);
    for (const listener of listeners) listener(source);
  };
  const local = (source: Source, action: () => void) => {
    if (disposed || !canEdit()) return;
    const from = doc.oplogVersion();
    action();
    doc.commit();
    const bytes = doc.export({ mode: 'update', from });
    from.free();
    refresh(source);
    for (const listener of updates) listener(bytes);
  };
  const unsubscribe = ownsDocument
    ? () => {}
    : tree.subscribe((batch) => {
        if (!disposed && batch.by === 'import') refresh('remote');
      });
  return {
    getDocument: () => projection.document,
    getClock() {
      if (disposed) return {};
      const version = doc.version();
      const clock = Object.fromEntries(version.toJSON());
      version.free();
      return clock;
    },
    getFrameConflicts: () => projection.frameConflicts,
    getHistory: () => ({
      canUndo: !disposed && canEdit() && history.canUndo(),
      canRedo: !disposed && canEdit() && history.canRedo(),
    }),
    commit(next: GraphicsDocument) {
      const validated = freezeDocument(next);
      local('local', () => writeScene(tree, projection.document, validated));
    },
    undo() {
      if (!disposed && history.canUndo())
        local('history', () => {
          history.undo();
        });
    },
    redo() {
      if (!disposed && history.canRedo())
        local('history', () => {
          history.redo();
        });
    },
    subscribe(listener: (source: Source) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeUpdates(listener: (bytes: Uint8Array) => void) {
      updates.add(listener);
      return () => {
        updates.delete(listener);
      };
    },
    receive(bytes: Uint8Array) {
      if (disposed) return;
      doc.import(bytes);
      refresh('remote');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      listeners.clear();
      updates.clear();
      history.free();
      tree.free();
      if (ownsDocument) doc.free();
    },
  };
}
export type LoroGraphicsBackend = ReturnType<typeof createLoroGraphicsBackend>;
