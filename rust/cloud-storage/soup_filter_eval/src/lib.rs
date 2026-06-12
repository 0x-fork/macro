#![deny(missing_docs)]
//! Client-side evaluation of soup filter ASTs against cached soup items.
//!
//! This crate answers the question "does this soup item match this filter?"
//! without a round trip to Postgres, so the frontend can drive optimistic
//! cache inserts/removals and targeted invalidation from one implementation
//! of the filter semantics — the same `item_filters` AST types the backend
//! compiles to SQL in `soup`'s `pg_soup_repo`.
//!
//! # Three-valued results
//!
//! A soup item payload does not carry everything the SQL can see (notification
//! state, task assignee properties, message-level email addresses, …), so
//! evaluation is three-valued ([`Truth`]):
//!
//! * [`Truth::Match`] — the item definitely satisfies the filter.
//! * [`Truth::NoMatch`] — the item definitely does not satisfy the filter.
//! * [`Truth::Unknown`] — the locally available fields are insufficient to
//!   decide. Callers should fall back to server reconciliation (e.g. skip the
//!   optimistic insert and refetch), which is exactly what the SQL would have
//!   decided for them.
//!
//! `Unknown` is combined with Kleene logic: `Unknown AND NoMatch = NoMatch`,
//! `Unknown OR Match = Match`, `NOT Unknown = Unknown`. SQL `NULL` comparisons
//! (e.g. a document with no `projectId` compared against a `ProjectId`
//! literal) are also surfaced as `Unknown` rather than `NoMatch`, because SQL
//! null-semantics and negation interact in ways a two-valued answer would get
//! wrong.
//!
//! # Source of truth
//!
//! Per-literal semantics mirror the SQL builders:
//! * documents/chats/projects/properties — `soup/src/outbound/pg_soup_repo/expanded/dynamic.rs`
//! * channels — `comms/src/outbound/postgres/comms_repo/dynamic.rs`
//! * emails — `email/src/outbound/email_pg_repo/dynamic/filters.rs`
//!
//! When a literal compiles to a no-op clause in those builders (for example
//! `ChatLiteral::Role` or soup's channel `ThreadId`/`Mention`/`Sender`), the
//! evaluator returns `Match` to stay faithful to what the endpoint actually
//! does, even where that differs from what the literal's name suggests.

use filter_ast::Expr;
use item_filters::EntityFilters;
use item_filters::ast::{EntityFilterAst, ExpandErr, LiteralTree};
use serde_json::{Map, Value};

mod item;
mod literals;
mod truth;

#[cfg(test)]
mod test;

pub use truth::Truth;

/// Caller-supplied context for predicates that depend on the requesting user.
#[derive(Debug, Clone, Default)]
pub struct EvalOptions {
    /// The macro user id of the requesting user (e.g. `macro|user@example.com`).
    ///
    /// Used by predicates that compare against the requester, such as the
    /// task `IncludeCbmAtmNc` ("created by me / assigned to me / not
    /// completed") document literal. When absent, those predicates evaluate
    /// to [`Truth::Unknown`] instead of deciding.
    pub current_user_id: Option<String>,
    /// The property definition id of the system "Assignees" property.
    ///
    /// The SQL for document `Importance` and `IncludeCbmAtmNc` joins
    /// `entity_properties` on this definition to test whether the requesting
    /// user is an assignee. When both this and `current_user_id` are
    /// provided, the evaluator runs the same test against the item's loaded
    /// `properties`; otherwise the assignee half of those predicates is
    /// [`Truth::Unknown`].
    pub assignees_property_definition_id: Option<uuid::Uuid>,
}

/// Caller-asserted per-item state for predicates whose data lives outside the
/// soup payload.
///
/// The backend's notification literals are **existence** probes against the
/// user's notifications (see `build_notification_done_clause` /
/// `build_notification_seen_clause` in soup's `pg_soup_repo`):
/// `NotificationDone(true)` matches when *at least one* non-deleted
/// notification for the entity has `done = true` — an entity with mixed
/// notifications matches both polarities, and an entity with none matches
/// neither. These fields mirror those probes exactly.
///
/// `Some(true)` asserts the probe succeeds, `Some(false)` asserts it cannot
/// (the caller has proven no such notification exists), and `None` means the
/// caller doesn't know — the literal stays [`Truth::Unknown`]. Callers
/// reading a paginated cache should only assert positives.
#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemState {
    /// Does a non-deleted notification with `done = true` exist for this
    /// entity?
    #[serde(default)]
    pub has_done_notification: Option<bool>,
    /// Does a non-deleted notification with `done = false` exist?
    #[serde(default)]
    pub has_undone_notification: Option<bool>,
    /// Does a non-deleted notification that has been seen exist?
    #[serde(default)]
    pub has_seen_notification: Option<bool>,
    /// Does a non-deleted notification that has not been seen exist?
    #[serde(default)]
    pub has_unseen_notification: Option<bool>,
}

impl ItemState {
    /// Evaluate a `NotificationDone(want)` literal against the asserted
    /// state.
    pub(crate) fn notification_done(&self, want: bool) -> Truth {
        let assertion = if want {
            self.has_done_notification
        } else {
            self.has_undone_notification
        };
        assertion.map_or(Truth::Unknown, Truth::from)
    }

    /// Evaluate a `NotificationSeen(want)` literal against the asserted
    /// state.
    pub(crate) fn notification_seen(&self, want: bool) -> Truth {
        let assertion = if want {
            self.has_seen_notification
        } else {
            self.has_unseen_notification
        };
        assertion.map_or(Truth::Unknown, Truth::from)
    }
}

/// Bundled evaluation context threaded through literal evaluation.
pub(crate) struct Ctx<'a> {
    pub(crate) opts: &'a EvalOptions,
    pub(crate) state: &'a ItemState,
}

/// The soup item payload was not shaped like a `SoupApiItem`.
#[derive(Debug, thiserror::Error)]
pub enum ItemError {
    /// The value is not a JSON object with a string `tag` field.
    #[error("soup item is missing a string `tag` field")]
    MissingTag,
    /// The value has no `data` object for its entity payload.
    #[error("soup item is missing a `data` object")]
    MissingData,
}

/// Evaluate an [`EntityFilterAst`] against one soup item.
///
/// `soup_item` must be the wire shape of a `SoupApiItem` / `SoupItem`:
/// a JSON object `{"tag": "...", "data": {...}}` (extra fields such as
/// `frecency_score` are ignored).
///
/// Items with a `tag` this build does not recognize evaluate to
/// [`Truth::Unknown`] so that an older evaluator degrades gracefully when the
/// backend grows new entity types.
pub fn eval_soup_item(
    ast: &EntityFilterAst,
    soup_item: &Value,
    opts: &EvalOptions,
) -> Result<Truth, ItemError> {
    eval_soup_item_with_state(ast, soup_item, &ItemState::default(), opts)
}

/// Like [`eval_soup_item`], with caller-asserted per-item [`ItemState`]
/// (e.g. notification done/seen from the frontend's notification cache) to
/// decide literals the payload alone cannot.
pub fn eval_soup_item_with_state(
    ast: &EntityFilterAst,
    soup_item: &Value,
    state: &ItemState,
    opts: &EvalOptions,
) -> Result<Truth, ItemError> {
    let tag = soup_item
        .get("tag")
        .and_then(Value::as_str)
        .ok_or(ItemError::MissingTag)?;
    let data = soup_item
        .get("data")
        .and_then(Value::as_object)
        .ok_or(ItemError::MissingData)?;
    let ctx = Ctx { opts, state };

    let branch = match tag {
        "document" => eval_tree(&ast.document_filter, |l| {
            literals::document::eval(l, data, &ctx)
        }),
        "chat" => eval_tree(&ast.chat_filter, |l| literals::chat::eval(l, data, &ctx)),
        "project" => eval_tree(&ast.project_filter, |l| {
            literals::project::eval(l, data, &ctx)
        }),
        "emailThread" => eval_tree(&ast.email_filter.tree, |l| {
            literals::email::eval(l, data, &ctx)
        }),
        "channel" => eval_tree(&ast.channel_filter, |l| {
            literals::channel::eval(l, data, &ctx)
        }),
        "call" => eval_tree(&ast.call_filter, |l| literals::call::eval(l, data)),
        "crmCompany" => eval_tree(&ast.crm_company_filter, |l| {
            literals::crm_company::eval(l, data)
        }),
        "foreignEntity" => eval_tree(&ast.foreign_entity_filter, |l| {
            literals::foreign_entity::eval(l, data)
        }),
        _ => return Ok(Truth::Unknown),
    };

    let properties = eval_tree(&ast.properties_filter, |l| {
        literals::properties::eval(l, tag, data)
    });

    Ok(branch.and(properties))
}

/// Evaluate typed [`EntityFilters`] (the `POST /items/soup` body shape)
/// against one soup item.
///
/// The filters are expanded through the same [`EntityFilterAst::new_from_filters`]
/// the soup router uses, so typed-filter and raw-AST callers share identical
/// semantics. Returns the expansion error when the filters are malformed
/// (invalid uuids, unknown file types, …), exactly as the endpoint would.
pub fn eval_entity_filters(
    filters: EntityFilters,
    soup_item: &Value,
    opts: &EvalOptions,
) -> Result<Result<Truth, ItemError>, ExpandErr> {
    let ast = EntityFilterAst::new_from_filters(filters)?;
    Ok(match ast {
        None => Ok(Truth::Match),
        Some(ast) => eval_soup_item(&ast, soup_item, opts),
    })
}

/// Evaluate an optional literal tree; an absent tree applies no constraint.
fn eval_tree<L>(tree: &LiteralTree<L>, mut eval_literal: impl FnMut(&L) -> Truth) -> Truth {
    match tree {
        None => Truth::Match,
        Some(expr) => eval_expr(expr, &mut eval_literal),
    }
}

/// Fold an [`Expr`] with Kleene three-valued logic.
fn eval_expr<L>(expr: &Expr<L>, eval_literal: &mut impl FnMut(&L) -> Truth) -> Truth {
    match expr {
        Expr::And(a, b) => eval_expr(a, eval_literal).and(eval_expr(b, eval_literal)),
        Expr::Or(a, b) => eval_expr(a, eval_literal).or(eval_expr(b, eval_literal)),
        Expr::Not(a) => !eval_expr(a, eval_literal),
        Expr::Literal(l) => eval_literal(l),
    }
}

/// Shared alias for the JSON object backing an item's `data` payload.
pub(crate) type Data = Map<String, Value>;
