#![deny(missing_docs)]
//! wasm-bindgen bindings for [`soup_filter_eval`].
//!
//! This is the frontend's single implementation of soup filter semantics:
//! the same `item_filters` AST the backend compiles to SQL, evaluated locally
//! against cached `SoupApiItem` payloads for optimistic cache updates and
//! targeted invalidation.
//!
//! The JS boundary is JSON strings in, verdict codes out, and is designed to
//! be called in batches (`matchesMany`) rather than per item per render.
//!
//! Build with `just build_soup_filter_wasm` (wasm-pack), which emits the
//! `@macro/soup-filter-wasm` package consumed by `js/app`.

use item_filters::EntityFilters;
use item_filters::ast::EntityFilterAst;
use soup_filter_eval::{EvalOptions, Truth, eval_soup_item};
use wasm_bindgen::prelude::*;

#[cfg(test)]
mod test;

/// Verdict codes returned across the JS boundary.
///
/// Kept as plain numbers so `matchesMany` can return a compact `Uint8Array`.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// The item definitely matches the filter.
    Match = 1,
    /// The item definitely does not match the filter.
    NoMatch = 0,
    /// Locally undecidable — fall back to server reconciliation.
    Unknown = 2,
}

impl From<Truth> for Verdict {
    fn from(t: Truth) -> Self {
        match t {
            Truth::Match => Verdict::Match,
            Truth::NoMatch => Verdict::NoMatch,
            Truth::Unknown => Verdict::Unknown,
        }
    }
}

/// A compiled soup filter, reusable across many item checks.
#[wasm_bindgen]
pub struct SoupFilter {
    ast: EntityFilterAst,
    opts: EvalOptions,
}

/// Internal constructors and evaluation with string errors, so logic stays
/// testable on native targets (`JsError` can only exist inside a JS runtime).
impl SoupFilter {
    fn try_from_ast(ast_json: &str, current_user_id: Option<String>) -> Result<Self, String> {
        let ast: EntityFilterAst =
            serde_json::from_str(ast_json).map_err(|e| format!("invalid soup filter AST: {e}"))?;
        Ok(SoupFilter {
            ast,
            opts: EvalOptions { current_user_id },
        })
    }

    fn try_from_typed_filters(
        filters_json: &str,
        current_user_id: Option<String>,
    ) -> Result<Self, String> {
        let filters: EntityFilters =
            serde_json::from_str(filters_json).map_err(|e| format!("invalid soup filters: {e}"))?;
        let ast = EntityFilterAst::new_from_filters(filters)
            .map_err(|e| format!("failed to expand soup filters: {e}"))?
            .unwrap_or_default();
        Ok(SoupFilter {
            ast,
            opts: EvalOptions { current_user_id },
        })
    }

    fn try_matches(&self, soup_item_json: &str) -> Result<Verdict, String> {
        let item: serde_json::Value =
            serde_json::from_str(soup_item_json).map_err(|e| format!("invalid soup item: {e}"))?;
        let truth = eval_soup_item(&self.ast, &item, &self.opts).map_err(|e| e.to_string())?;
        Ok(truth.into())
    }

    fn try_matches_many(&self, soup_items_json: &str) -> Result<Vec<u8>, String> {
        let items: Vec<serde_json::Value> = serde_json::from_str(soup_items_json)
            .map_err(|e| format!("invalid soup items array: {e}"))?;
        items
            .iter()
            .map(|item| {
                eval_soup_item(&self.ast, item, &self.opts)
                    .map(|t| Verdict::from(t) as u8)
                    .map_err(|e| e.to_string())
            })
            .collect()
    }

    fn try_ast_json(&self) -> Result<String, String> {
        serde_json::to_string(&self.ast).map_err(|e| e.to_string())
    }
}

#[wasm_bindgen]
impl SoupFilter {
    /// Build a filter from a raw AST JSON string — the body shape of
    /// `POST /items/soup/ast` (`{"df": ..., "ef": ..., ...}`).
    ///
    /// `current_user_id` enables requester-dependent predicates (e.g. the
    /// task created-by-me filter); pass `undefined` to leave them
    /// undecidable.
    #[wasm_bindgen(js_name = fromAst)]
    pub fn from_ast(
        ast_json: &str,
        current_user_id: Option<String>,
    ) -> Result<SoupFilter, JsError> {
        Self::try_from_ast(ast_json, current_user_id).map_err(|e| JsError::new(&e))
    }

    /// Build a filter from typed filters JSON — the body shape of
    /// `POST /items/soup` (`{"document_filters": ..., ...}`).
    ///
    /// Expansion runs through the same `EntityFilterAst::new_from_filters`
    /// the soup router uses, so malformed filters fail here with the same
    /// errors the endpoint would produce.
    #[wasm_bindgen(js_name = fromTypedFilters)]
    pub fn from_typed_filters(
        filters_json: &str,
        current_user_id: Option<String>,
    ) -> Result<SoupFilter, JsError> {
        Self::try_from_typed_filters(filters_json, current_user_id).map_err(|e| JsError::new(&e))
    }

    /// Evaluate one `SoupApiItem` JSON string. Returns a [`Verdict`].
    pub fn matches(&self, soup_item_json: &str) -> Result<Verdict, JsError> {
        self.try_matches(soup_item_json)
            .map_err(|e| JsError::new(&e))
    }

    /// Evaluate a JSON array of `SoupApiItem`s in one boundary crossing.
    /// Returns one [`Verdict`] code per item, in order.
    #[wasm_bindgen(js_name = matchesMany)]
    pub fn matches_many(&self, soup_items_json: &str) -> Result<Vec<u8>, JsError> {
        self.try_matches_many(soup_items_json)
            .map_err(|e| JsError::new(&e))
    }

    /// The expanded AST as JSON — the exact body for `POST /items/soup/ast`.
    ///
    /// Lets the frontend build typed filters once and obtain the canonical
    /// AST from the same Rust expansion the backend uses, instead of
    /// mirroring the expansion in TypeScript.
    #[wasm_bindgen(js_name = astJson)]
    pub fn ast_json(&self) -> Result<String, JsError> {
        self.try_ast_json().map_err(|e| JsError::new(&e))
    }
}
