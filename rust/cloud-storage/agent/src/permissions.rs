//! Tool permissions.
//!
//! A [`PermissionsRepo`] decides, per tool, whether a call may run
//! automatically, is always denied, or requires explicit user permission. The
//! initial implementation ([`HintPermissionsRepo`]) derives the decision purely
//! from a tool's MCP-style [`ToolAnnotations`]: a destructive tool needs
//! permission, everything else is allowed.
//!
//! It is a trait so different AI surfaces can differ — the interactive chat
//! gates destructive tools, while memory / automations / the MCP server may
//! want a stricter or looser policy — without changing the agent loop.

use ai_toolset::{ToolAnnotations, ToolSet};

/// The permission decision for a single tool.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Permission {
    /// The tool runs automatically with no user interaction.
    AlwaysAllow,
    /// The tool is never run.
    ///
    /// Reserved for a future user-preferences repo; the hint-derived repo never
    /// produces it.
    AlwaysDeny,
    /// The tool requires explicit user permission (accept / deny) before it
    /// runs. The agent loop suspends on such a call.
    NeedsPermission,
}

impl Permission {
    /// Whether a call to a tool with this permission must suspend the loop for
    /// user resolution before it can run.
    pub fn requires_resolution(self) -> bool {
        matches!(self, Permission::NeedsPermission | Permission::AlwaysDeny)
    }
}

/// Decides the [`Permission`] for a tool.
///
/// Implementors map a tool (identified by name, with its annotations) to a
/// [`Permission`]. This is intentionally synchronous and infallible for the
/// hint-derived repo, but the trait is `async` + fallible so a future
/// database-backed user-preferences repo fits the same shape.
pub trait PermissionsRepo: Send + Sync {
    /// The permission for the tool named `tool_name`, given its `annotations`
    /// (as surfaced by [`ToolSet::tool_annotations`]). `None` annotations means
    /// the tool carries no hints (treated as non-destructive).
    fn get_permission(&self, tool_name: &str, annotations: Option<&ToolAnnotations>) -> Permission;
}

/// A [`PermissionsRepo`] that derives permissions purely from tool hints.
///
/// - `destructive_hint == Some(true)` → [`Permission::NeedsPermission`]
/// - everything else (read-only, additive, unhinted) → [`Permission::AlwaysAllow`]
///
/// Never produces [`Permission::AlwaysDeny`]; that arm is for a future
/// user-preferences repo.
#[derive(Debug, Clone, Copy, Default)]
pub struct HintPermissionsRepo;

impl PermissionsRepo for HintPermissionsRepo {
    fn get_permission(
        &self,
        _tool_name: &str,
        annotations: Option<&ToolAnnotations>,
    ) -> Permission {
        return Permission::NeedsPermission;
        match annotations {
            Some(a) if a.is_destructive() => Permission::NeedsPermission,
            _ => Permission::AlwaysAllow,
        }
    }
}

/// Look up the [`Permission`] for `tool_name` in `toolset` via `repo`.
///
/// Convenience that reads the tool's annotations off the toolset and asks the
/// repo. Used by the stream bridge before dispatch.
pub fn permission_for<Context>(
    repo: &dyn PermissionsRepo,
    toolset: &dyn ToolSet<Context>,
    tool_name: &str,
) -> Permission {
    let annotations = toolset.tool_annotations(tool_name);
    repo.get_permission(tool_name, annotations.as_ref())
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn destructive_needs_permission() {
        let repo = HintPermissionsRepo;
        let ann = ToolAnnotations::destructive();
        assert_eq!(
            repo.get_permission("DeleteThing", Some(&ann)),
            Permission::NeedsPermission
        );
    }

    #[test]
    fn non_destructive_always_allow() {
        let repo = HintPermissionsRepo;
        let ann = ToolAnnotations::default();
        assert_eq!(
            repo.get_permission("ReadThing", Some(&ann)),
            Permission::AlwaysAllow
        );
    }

    #[test]
    fn unhinted_always_allow() {
        let repo = HintPermissionsRepo;
        assert_eq!(
            repo.get_permission("Unknown", None),
            Permission::AlwaysAllow
        );
    }

    #[test]
    fn explicit_non_destructive_always_allow() {
        let repo = HintPermissionsRepo;
        let ann = ToolAnnotations {
            destructive_hint: Some(false),
            ..Default::default()
        };
        assert_eq!(
            repo.get_permission("Additive", Some(&ann)),
            Permission::AlwaysAllow
        );
    }
}
