import { EmptyState } from '@app/component/next-soup/soup-view/empty-states';
import {
  buildFolderTreeIndex,
  type FolderTreeIndex,
} from '@app/component/next-soup/soup-view/folder-tree-index';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { LoadingBlock } from '@core/component/LoadingBlock';
import { toast } from '@core/component/Toast/Toast';
import { useUserId } from '@core/context/user';
import EmptyStateFolderIcon from '@design/empty-state-folder.svg';
import {
  FileTree,
  type FileTreeDirectoryHandle,
  type FileTreeDropContext,
  type FileTreeDropResult,
  type FileTreeItemHandle,
} from '@pierre/trees';
import { queryClient } from '@queries/client';
import { storageKeys } from '@queries/storage/keys';
import {
  invalidateProjects,
  useProjectsQuery,
} from '@queries/storage/projects';
import { storageServiceClient } from '@service-storage/client';
import type { Project } from '@service-storage/generated/schemas/project';
import { refetchResources } from '@service-storage/util/refetchResources';
import { EmptyStatePanel } from '@ui';
import {
  createEffect,
  createMemo,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js';

/**
 * Hierarchical rendering of a folder surface, built on `@pierre/trees`.
 * Folders come from the projects query (the soup query is paginated, so it
 * can't guarantee the ancestors a tree needs); the Owned/All tabs still
 * apply. Folders can be re-parented by dragging — including dropping onto
 * empty space to move a subfolder up to the top level.
 *
 * With `rootProjectId` the tree is scoped to that folder's subtree (used
 * inside an open folder); dropping onto empty space then moves the dragged
 * folder directly under the root folder.
 */
export const SoupFolderTreeView = (props: { rootProjectId?: string }) => {
  const { activeTab } = useSoupView();
  const userId = useUserId();
  const projects = useProjectsQuery();

  const treeIndex = createMemo<FolderTreeIndex | undefined>(() => {
    const data = projects.data;
    if (!data) return undefined;
    return buildFolderTreeIndex(data, {
      ownerId: activeTab() === 'owned' ? userId() : undefined,
      rootId: props.rootProjectId,
    });
  });

  return (
    <div class="size-full min-h-0 bg-surface">
      <Switch>
        <Match when={treeIndex()?.paths.length}>
          <FolderTreeCanvas
            index={treeIndex}
            rootProjectId={props.rootProjectId}
          />
        </Match>
        <Match when={treeIndex() || projects.isError}>
          <Show
            when={props.rootProjectId}
            fallback={<EmptyState listView="folders" />}
          >
            <EmptyStatePanel
              align="center"
              graphic={EmptyStateFolderIcon}
              title="No subfolders"
              description="Folders created inside this folder will appear here."
            />
          </Show>
        </Match>
        <Match when={true}>
          <LoadingBlock />
        </Match>
      </Switch>
    </div>
  );
};

/** Parent directory of a canonical path: `a/b/` -> `a/`, `b/` -> ``. */
const parentPathOf = (path: string) => {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  const lastSlash = trimmed.lastIndexOf('/');
  return lastSlash === -1 ? '' : trimmed.slice(0, lastSlash + 1);
};

/** Final segment of a canonical path: `a/b/` -> `b/`. */
const basenameOf = (path: string) => path.slice(parentPathOf(path).length);

const samePaths = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((path, i) => path === b[i]);

const isDirectoryHandle = (
  item: FileTreeItemHandle
): item is FileTreeDirectoryHandle => item.isDirectory();

const FolderTreeCanvas = (props: {
  index: () => FolderTreeIndex | undefined;
  rootProjectId?: string;
}) => {
  const panel = useSplitPanelOrThrow();
  const { searchText } = useSoupView();

  let container!: HTMLDivElement;
  let tree: FileTree | undefined;

  // A drop at the tree root means "top level" for the full hierarchy and
  // "directly inside this folder" for a rooted subtree.
  const dropTargetParentId = (target: FileTreeDropContext['target']) => {
    if (target.kind === 'root' || !target.directoryPath) {
      return props.rootProjectId ?? null;
    }
    return (
      props.index()?.idByPath.get(target.directoryPath) ??
      props.rootProjectId ??
      null
    );
  };

  // The tree applies drops to its own model before calling onDropComplete,
  // so persist the new parent and re-sync from the server — which confirms
  // the move, or snaps the tree back if the server rejected it.
  const persistMove = async (movedIds: string[], parentId: string | null) => {
    queryClient.setQueryData<{ projects: Project[]; pending: Project[] }>(
      storageKeys.projects.list.queryKey,
      (old) => {
        if (!old) return old;
        const reparent = (p: Project) =>
          movedIds.includes(p.id) ? { ...p, parentId } : p;
        return {
          projects: old.projects.map(reparent),
          pending: old.pending.map(reparent),
        };
      }
    );

    let failures = 0;
    try {
      const results = await Promise.all(
        movedIds.map((id) =>
          storageServiceClient.projects.edit({
            id,
            projectParentId: parentId,
          })
        )
      );
      failures = results.filter((result) => result.isErr()).length;
    } catch {
      failures = movedIds.length;
    }

    if (failures > 0) {
      toast.failure(
        failures === 1
          ? 'Could not move folder'
          : `Could not move ${failures} folders`
      );
    }

    await invalidateProjects();
    refetchResources();
  };

  // Mirror a move the tree has already applied to itself into the index
  // maps, so expansion capture keeps working in the window before the
  // projects cache catches up and the index is rebuilt.
  const remapMovedPaths = (
    index: FolderTreeIndex,
    from: string,
    to: string
  ) => {
    const moved: Array<[oldPath: string, newPath: string, id: string]> = [];
    for (const [path, id] of index.idByPath) {
      if (path === from || path.startsWith(from)) {
        moved.push([path, `${to}${path.slice(from.length)}`, id]);
      }
    }
    for (const [oldPath, newPath, id] of moved) {
      index.idByPath.delete(oldPath);
      index.idByPath.set(newPath, id);
      index.pathById.set(id, newPath);
    }
  };

  const handleDrop = (result: FileTreeDropResult) => {
    const index = props.index();
    if (!index) return;

    // `draggedPaths` are the pre-move paths; the tree has already moved them
    // under the target. Resolve ids before remapping the index to match.
    const targetDirPath =
      result.target.kind === 'root' ? '' : (result.target.directoryPath ?? '');
    const parentId = dropTargetParentId(result.target);
    const movedIds: string[] = [];
    for (const oldPath of result.draggedPaths) {
      const id = index.idByPath.get(oldPath);
      if (id === undefined) continue;
      movedIds.push(id);
      remapMovedPaths(index, oldPath, `${targetDirPath}${basenameOf(oldPath)}`);
    }
    if (movedIds.length === 0) return;

    void persistMove(movedIds, parentId);
  };

  const expandedPathsFor = (
    nextIndex: FolderTreeIndex,
    prevIndex: FolderTreeIndex
  ) => {
    if (!tree) return [];
    const expanded: string[] = [];
    for (const [path, id] of prevIndex.idByPath) {
      const item = tree.getItem(path);
      if (!item || !isDirectoryHandle(item) || !item.isExpanded()) continue;
      const nextPath = nextIndex.pathById.get(id);
      if (nextPath) expanded.push(nextPath);
    }
    return expanded;
  };

  onMount(() => {
    const index = props.index();
    if (!index) return;

    tree = new FileTree({
      paths: index.paths,
      initialExpansion: 'open',
      stickyFolders: true,
      search: false,
      dragAndDrop: {
        // Dropping items where they already live is a no-op; suppress the
        // drop affordance instead of erroring.
        canDrop: ({ draggedPaths, target }) => {
          const targetPath =
            target.kind === 'root' ? '' : (target.directoryPath ?? '');
          return draggedPaths.some((path) => parentPathOf(path) !== targetPath);
        },
        onDropComplete: handleDrop,
        onDropError: () => toast.failure('Could not move folder'),
      },
    });

    tree.render({ containerWrapper: container });

    const initialSearch = searchText();
    if (initialSearch) tree.setSearch(initialSearch);
  });

  onCleanup(() => {
    tree?.cleanUp();
    tree = undefined;
  });

  // Rebuild the tree when the underlying folder set changes (create, delete,
  // rename, move, tab switch), carrying expansion over by folder id.
  createEffect(
    on(
      () => props.index(),
      (index, prevIndex) => {
        if (!tree || !index || !prevIndex) return;
        if (samePaths(index.paths, prevIndex.paths)) return;
        tree.resetPaths(index.paths, {
          initialExpandedPaths: expandedPathsFor(index, prevIndex),
        });
      },
      { defer: true }
    )
  );

  // The soup search bar drives the tree's search session, which filters to
  // matching folders.
  createEffect(
    on(
      searchText,
      (text) => {
        if (!tree) return;
        if (text) tree.setSearch(text);
        else if (tree.isSearchOpen()) tree.closeSearch();
      },
      { defer: true }
    )
  );

  // Double-clicking a row opens the folder in this split (single click is
  // expand/collapse + selection, handled by the tree itself). Tree rows live
  // in a shadow root, so resolve the row via the composed event path.
  const openFocusedFolder = (event: MouseEvent) => {
    if (!tree) return;
    const onRow = event
      .composedPath()
      .some(
        (node) =>
          node instanceof Element && node.getAttribute('role') === 'treeitem'
      );
    if (!onRow) return;

    const path = tree.getFocusedPath();
    const index = props.index();
    if (!path || !index) return;
    const id = index.idByPath.get(path) ?? index.idByPath.get(`${path}/`);
    const project = id ? index.projectById.get(id) : undefined;
    if (!project) return;

    void openEntityInSplitFromUnifiedList(
      {
        type: 'project',
        id: project.id,
        name: project.name,
        ownerId: project.userId,
      },
      { splitHandle: panel.handle }
    );
  };

  return (
    <div
      ref={container}
      class="size-full min-h-0 overflow-hidden"
      onDblClick={openFocusedFolder}
      style={{
        '--trees-bg-override': 'var(--color-surface)',
        '--trees-fg-override': 'var(--color-ink)',
        '--trees-fg-muted-override': 'var(--color-ink-muted)',
        '--trees-accent-override': 'var(--color-accent)',
        '--trees-border-color-override': 'var(--color-edge-muted)',
        '--trees-selected-bg-override': 'var(--color-accent-bg)',
        '--trees-selected-fg-override': 'var(--color-ink)',
        '--trees-focus-ring-color-override': 'var(--color-accent)',
        '--trees-font-family-override': 'var(--font-sans)',
      }}
    />
  );
};
