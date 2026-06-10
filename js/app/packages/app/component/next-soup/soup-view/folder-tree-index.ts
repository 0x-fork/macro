import type { Project } from '@service-storage/generated/schemas/project';

/**
 * Derived mapping between folder (project) entities and the canonical
 * path strings used by `@pierre/trees`, which keys all tree state by path.
 * Every folder renders as a directory, so every path ends with `/`.
 */
export interface FolderTreeIndex {
  /** Canonical directory paths for every included folder. */
  paths: string[];
  /** Canonical path -> project id. */
  idByPath: Map<string, string>;
  /** Project id -> canonical path. */
  pathById: Map<string, string>;
  /** Project id -> source project. */
  projectById: Map<string, Project>;
}

/**
 * Folder names become path segments, so the path separator is swapped for a
 * lookalike (U+2215 division slash) and blank names get a placeholder.
 */
const toPathSegment = (name: string) => {
  const sanitized = name.replace(/\//g, '∕').trim();
  return sanitized.length > 0 ? sanitized : 'Untitled';
};

/**
 * Builds the path index for the folder hierarchy.
 *
 * - `ownerId` keeps only folders owned by that user, plus any ancestors
 *   needed to render them in their real position in the hierarchy.
 * - A folder whose `parentId` is missing from the input (e.g. deleted or
 *   not visible) is treated as a root folder.
 * - Duplicate sibling names get a ` (2)`, ` (3)`… suffix because paths must
 *   be unique. Siblings are visited in (name, id) order so suffix
 *   assignment is stable across rebuilds.
 * - Folders trapped in a `parentId` cycle are unreachable from the root and
 *   are dropped rather than looping forever; the server does not produce
 *   cycles.
 */
export function buildFolderTreeIndex(
  projects: Project[],
  options: { ownerId?: string } = {}
): FolderTreeIndex {
  const byId = new Map(projects.map((project) => [project.id, project]));

  let included: Set<string> | undefined;
  if (options.ownerId !== undefined) {
    included = new Set<string>();
    for (const project of projects) {
      if (project.userId !== options.ownerId) continue;
      let current: Project | undefined = project;
      while (current && !included.has(current.id)) {
        included.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }
  }

  const ROOT = '';
  const childrenOf = new Map<string, Project[]>();
  for (const project of projects) {
    if (included && !included.has(project.id)) continue;
    const hasParent =
      project.parentId != null &&
      byId.has(project.parentId) &&
      (!included || included.has(project.parentId));
    const parentKey = hasParent ? (project.parentId as string) : ROOT;
    const siblings = childrenOf.get(parentKey);
    if (siblings) siblings.push(project);
    else childrenOf.set(parentKey, [project]);
  }

  const paths: string[] = [];
  const idByPath = new Map<string, string>();
  const pathById = new Map<string, string>();
  const projectById = new Map<string, Project>();

  const visit = (parentKey: string, parentPath: string) => {
    const children = childrenOf.get(parentKey);
    if (!children) return;
    // Sort by the displayed segment (not the raw name) so suffix
    // assignment follows the visual order.
    const ordered = children
      .map((project) => ({ project, base: toPathSegment(project.name) }))
      .sort(
        (a, b) =>
          a.base.localeCompare(b.base, undefined, { sensitivity: 'base' }) ||
          a.project.id.localeCompare(b.project.id)
      );
    const usedSegments = new Set<string>();
    for (const { project: child, base } of ordered) {
      let segment = base;
      for (let n = 2; usedSegments.has(segment); n++) {
        segment = `${base} (${n})`;
      }
      usedSegments.add(segment);

      const path = `${parentPath}${segment}/`;
      paths.push(path);
      idByPath.set(path, child.id);
      pathById.set(child.id, path);
      projectById.set(child.id, child);
      visit(child.id, path);
    }
  };
  visit(ROOT, '');

  return { paths, idByPath, pathById, projectById };
}
