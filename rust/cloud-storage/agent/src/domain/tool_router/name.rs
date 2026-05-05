use std::borrow::Cow;

use crate::domain::error::{AgentError, Result};

pub(super) const DELIMITER: char = '_';

#[derive(Clone, Eq, PartialEq, Ord, PartialOrd)]
pub(super) struct ToolSetName<'a>(Cow<'a, str>);

impl<'a> ToolSetName<'a> {
    pub fn new(s: String) -> Result<ToolSetName<'static>> {
        let s = s.replace(DELIMITER, "-");
        if s.is_empty() {
            Err(AgentError::ToolRouter(
                "construction expected non-empty name".into(),
            ))
        } else {
            Ok(ToolSetName(Cow::Owned(s)))
        }
    }

    pub fn name(&self) -> &str {
        &self.0
    }

    pub fn demangle(s: &str) -> Result<(&str, &str)> {
        s.split_once(DELIMITER)
            .ok_or_else(|| AgentError::ToolRouter(format!("invalid mangled name: {s}")))
    }

    pub fn mangle(&self, name: &str) -> String {
        format!("{}{}{}", self.0, DELIMITER, name)
    }
}
