//! Namespaced Identifier type for foreign entities
//!
//! A namespaced identifier is a structured identifier for external entities,
//! formatted as: `namespace::subnamespace::...::<identifier>`
//!
//! # Examples
//!
//! ```
//! use model_entity::NamespacedIdentifier;
//!
//! let ns_id = NamespacedIdentifier::parse("discord::channel:842650710688399402").unwrap();
//! assert_eq!(ns_id.path(), &["discord", "channel"]);
//! assert_eq!(ns_id.identifier(), "842650710688399402");
//!
//! let ns_id = NamespacedIdentifier::parse("github::repo::branch:macro-inc/macro#main").unwrap();
//! assert_eq!(ns_id.path(), &["github", "repo", "branch"]);
//! assert_eq!(ns_id.identifier(), "macro-inc/macro#main");
//! ```

use serde::{Deserialize, Serialize};
use std::fmt;

/// Error type for namespaced identifier parsing
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NamespacedIdentifierError {
    /// The input string was empty
    EmptyInput,
    /// No identifier portion found (missing final `:`)
    MissingIdentifier,
    /// The identifier portion was empty
    EmptyIdentifier,
    /// The path portion was empty or invalid
    EmptyPath,
    /// A path segment was empty
    EmptyPathSegment,
    /// A path segment contained invalid characters (`:` or `::`)
    InvalidPathSegment(String),
}

impl fmt::Display for NamespacedIdentifierError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyInput => write!(f, "input string is empty"),
            Self::MissingIdentifier => {
                write!(f, "missing identifier portion (expected format: path:identifier)")
            }
            Self::EmptyIdentifier => write!(f, "identifier portion is empty"),
            Self::EmptyPath => write!(f, "path portion is empty"),
            Self::EmptyPathSegment => write!(f, "path contains empty segment"),
            Self::InvalidPathSegment(segment) => {
                write!(f, "path segment '{}' contains invalid characters", segment)
            }
        }
    }
}

impl std::error::Error for NamespacedIdentifierError {}

/// A namespaced identifier for foreign entities
///
/// Format: `namespace::subnamespace::...::type:identifier`
///
/// The path is a `::` delimited hierarchy, and the identifier is separated by a final `:`
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct NamespacedIdentifier {
    /// The hierarchical path (e.g., ["discord", "channel"])
    path: Vec<String>,
    /// The final identifier (e.g., "842650710688399402")
    identifier: String,
}

impl NamespacedIdentifier {
    /// Parse a namespaced identifier from a string
    ///
    /// # Format
    ///
    /// `namespace::subnamespace::...::type:identifier`
    ///
    /// # Examples
    ///
    /// ```
    /// use model_entity::NamespacedIdentifier;
    ///
    /// let ns_id = NamespacedIdentifier::parse("discord::channel:842650710688399402").unwrap();
    /// assert_eq!(ns_id.to_string(), "discord::channel:842650710688399402");
    ///
    /// let ns_id = NamespacedIdentifier::parse("github::user:roobscoob").unwrap();
    /// assert_eq!(ns_id.to_string(), "github::user:roobscoob");
    /// ```
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The input is empty
    /// - No identifier portion is found
    /// - The identifier is empty
    /// - The path is empty or contains empty segments
    /// - Path segments contain `:` or `::`
    pub fn parse(input: &str) -> Result<Self, NamespacedIdentifierError> {
        if input.is_empty() {
            return Err(NamespacedIdentifierError::EmptyInput);
        }

        // Split by "::" to get path segments (last segment will contain the identifier)
        let segments: Vec<&str> = input.split("::").collect();

        if segments.is_empty() {
            return Err(NamespacedIdentifierError::EmptyPath);
        }

        // The last segment should contain "type:identifier"
        let last_segment = segments[segments.len() - 1];

        // Find the first ':' in the last segment to separate the final path segment from identifier
        let colon_pos = last_segment
            .find(':')
            .ok_or(NamespacedIdentifierError::MissingIdentifier)?;

        let last_path_segment = &last_segment[..colon_pos];
        let identifier = &last_segment[colon_pos + 1..];

        // Validate identifier
        if identifier.is_empty() {
            return Err(NamespacedIdentifierError::EmptyIdentifier);
        }

        // Build the full path (all segments except last, plus the portion of last segment before ':')
        let mut path: Vec<String> = segments[..segments.len() - 1]
            .iter()
            .map(|s| s.to_string())
            .collect();
        path.push(last_path_segment.to_string());

        // Validate path segments
        for segment in &path {
            if segment.is_empty() {
                return Err(NamespacedIdentifierError::EmptyPathSegment);
            }
            // Path segments should not contain ':' (we already split on '::')
            if segment.contains(':') {
                return Err(NamespacedIdentifierError::InvalidPathSegment(
                    segment.clone(),
                ));
            }
        }

        Ok(Self {
            path,
            identifier: identifier.to_string(),
        })
    }

    /// Create a new namespaced identifier from components
    ///
    /// # Examples
    ///
    /// ```
    /// use model_entity::NamespacedIdentifier;
    ///
    /// let ns_id = NamespacedIdentifier::new(
    ///     vec!["discord".to_string(), "channel".to_string()],
    ///     "842650710688399402".to_string()
    /// ).unwrap();
    /// assert_eq!(ns_id.to_string(), "discord::channel:842650710688399402");
    /// ```
    ///
    /// # Errors
    ///
    /// Returns an error if validation fails (same rules as `parse`)
    pub fn new(path: Vec<String>, identifier: String) -> Result<Self, NamespacedIdentifierError> {
        if path.is_empty() {
            return Err(NamespacedIdentifierError::EmptyPath);
        }

        if identifier.is_empty() {
            return Err(NamespacedIdentifierError::EmptyIdentifier);
        }

        for segment in &path {
            if segment.is_empty() {
                return Err(NamespacedIdentifierError::EmptyPathSegment);
            }
            if segment.contains(':') {
                return Err(NamespacedIdentifierError::InvalidPathSegment(
                    segment.clone(),
                ));
            }
        }

        Ok(Self { path, identifier })
    }

    /// Get the path segments
    pub fn path(&self) -> &[String] {
        &self.path
    }

    /// Get the identifier
    pub fn identifier(&self) -> &str {
        &self.identifier
    }

    /// Get the namespace (first path segment)
    ///
    /// # Examples
    ///
    /// ```
    /// use model_entity::NamespacedIdentifier;
    ///
    /// let ns_id = NamespacedIdentifier::parse("discord::channel:123").unwrap();
    /// assert_eq!(ns_id.namespace(), "discord");
    /// ```
    pub fn namespace(&self) -> &str {
        &self.path[0]
    }

    /// Deconstruct into owned components
    pub fn into_parts(self) -> (Vec<String>, String) {
        (self.path, self.identifier)
    }
}

impl fmt::Display for NamespacedIdentifier {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.path.join("::"), self.identifier)
    }
}

impl std::str::FromStr for NamespacedIdentifier {
    type Err = NamespacedIdentifierError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse(s)
    }
}

#[cfg(test)]
mod test;
