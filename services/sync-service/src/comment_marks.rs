//! Stripping of orphaned comment highlight marks when a document is copied.
//!
//! Duplicating a document intentionally does not copy its comment threads
//! (see the `Thread`/`Comment` tables owned by `crates/documents`), but the
//! raw Loro snapshot for a markdown document still embeds inline mark
//! wrapper nodes (Lexical `MarkNode`/`CommentNode`) around the highlighted
//! text. Left untouched, a duplicated document would render a highlight
//! with no comment behind it. This module walks the copied document's node
//! tree and unwraps any such mark nodes, keeping their underlying content
//! but discarding the wrapper.
//!
//! A node is treated as a mark wrapper if it has a non-empty `ids` list,
//! which is how Lexical's `MarkNode`/`CommentNode` serialize into this
//! document's schema (see `packages/lexical-core/markdown-loro-schema.ts`).
//! This intentionally strips any mark-style node, not just `comment-mark`
//! ones, since none of them have a corresponding comment thread after a copy.

use loro::{Container, ExportMode, LoroDoc, LoroMap, LoroMovableList};
use tracing::instrument;

use crate::error::ResultExt;

/// The name of the top-level container holding the document's node tree.
const ROOT_CONTAINER: &str = "root";
/// The node field holding a mark's list of comment/thread ids.
const IDS_FIELD: &str = "ids";
/// The node field holding a node's own children.
const CHILDREN_FIELD: &str = "children";

/// Strips inline comment/mark wrapper nodes from a Loro document snapshot,
/// returning a re-exported snapshot with the wrappers removed. The
/// underlying wrapped content (text, nested elements, etc.) is preserved
/// in place.
#[instrument(skip_all, err)]
pub fn strip_orphaned_marks(snapshot: &[u8]) -> worker::Result<Vec<u8>> {
    let doc = LoroDoc::new();
    doc.import_with(snapshot, "strip_orphaned_marks")
        .context("failed to import snapshot for mark stripping")?;

    let root = doc.get_map(ROOT_CONTAINER);
    strip_marks_from_children(&root);

    doc.export(ExportMode::Snapshot)
        .context("failed to export snapshot after stripping marks")
}

/// Recursively removes mark wrapper nodes from `node`'s `children` list
/// (postorder, so nested/overlapping marks are all flattened), splicing each
/// wrapper's own children into its parent's children list in its place.
fn strip_marks_from_children(node: &LoroMap) {
    let Some(children) = get_children(node) else {
        return;
    };

    let mut i = 0;
    while i < children.len() {
        let Some(child) = get_map_at(&children, i) else {
            i += 1;
            continue;
        };

        // Postorder: clean any nested/overlapping marks inside this child first.
        strip_marks_from_children(&child);

        if !has_non_empty_ids(&child) {
            i += 1;
            continue;
        }

        // This child is a mark wrapper: splice its own (already-cleaned)
        // children into the parent's list in its place.
        let grandchildren: Vec<LoroMap> = get_children(&child)
            .map(|list| {
                (0..list.len())
                    .filter_map(|j| get_map_at(&list, j))
                    .collect()
            })
            .unwrap_or_default();

        if children.delete(i, 1).is_err() {
            // Best-effort: if we can't remove the wrapper, leave it in place
            // rather than risk leaving the tree in an inconsistent state.
            tracing::error!(index = i, "failed to delete mark wrapper node");
            i += 1;
            continue;
        }

        for (offset, grandchild) in grandchildren.iter().enumerate() {
            if let Err(error) = children.insert_container(i + offset, grandchild.clone()) {
                tracing::error!(error=?error, "failed to re-insert mark wrapper's child");
            }
        }
        i += grandchildren.len();
    }
}

/// Returns `true` if `node`'s `ids` field is a non-empty list, i.e. `node`
/// is a mark-style wrapper node.
fn has_non_empty_ids(node: &LoroMap) -> bool {
    let Some(value) = node.get(IDS_FIELD) else {
        return false;
    };
    matches!(value.into_container(), Ok(Container::List(list)) if !list.is_empty())
}

/// Returns `node`'s `children` container, if it has one.
fn get_children(node: &LoroMap) -> Option<LoroMovableList> {
    let value = node.get(CHILDREN_FIELD)?;
    match value.into_container() {
        Ok(Container::MovableList(list)) => Some(list),
        _ => None,
    }
}

/// Returns the map at `idx` in `list`, if the value there is a map container.
fn get_map_at(list: &LoroMovableList, idx: usize) -> Option<LoroMap> {
    let value = list.get(idx)?;
    match value.into_container() {
        Ok(Container::Map(map)) => Some(map),
        _ => None,
    }
}

#[cfg(test)]
mod test;
