//! Three-valued (Kleene) logic for filter evaluation.

/// The result of evaluating a filter (or sub-expression) against a locally
/// cached soup item.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Truth {
    /// The item definitely satisfies the expression.
    Match,
    /// The item definitely does not satisfy the expression.
    NoMatch,
    /// The locally available data is insufficient to decide. Callers should
    /// defer to the server (skip the optimistic operation and reconcile).
    Unknown,
}

impl Truth {
    /// Kleene conjunction: `NoMatch` dominates, then `Unknown`.
    pub fn and(self, other: Self) -> Self {
        match (self, other) {
            (Truth::NoMatch, _) | (_, Truth::NoMatch) => Truth::NoMatch,
            (Truth::Unknown, _) | (_, Truth::Unknown) => Truth::Unknown,
            (Truth::Match, Truth::Match) => Truth::Match,
        }
    }

    /// Kleene disjunction: `Match` dominates, then `Unknown`.
    pub fn or(self, other: Self) -> Self {
        match (self, other) {
            (Truth::Match, _) | (_, Truth::Match) => Truth::Match,
            (Truth::Unknown, _) | (_, Truth::Unknown) => Truth::Unknown,
            (Truth::NoMatch, Truth::NoMatch) => Truth::NoMatch,
        }
    }
}

impl std::ops::Not for Truth {
    type Output = Truth;

    /// Kleene negation: `Unknown` stays `Unknown`.
    fn not(self) -> Truth {
        match self {
            Truth::Match => Truth::NoMatch,
            Truth::NoMatch => Truth::Match,
            Truth::Unknown => Truth::Unknown,
        }
    }
}

impl From<bool> for Truth {
    fn from(b: bool) -> Self {
        if b { Truth::Match } else { Truth::NoMatch }
    }
}
