//! Document embedding
use crate::Embeddable;
use std::borrow::Cow;

static TITLE: &str = "title";
static BODY: &str = "body";

/// A markdown document
pub struct Document<'a> {
    /// document name
    pub title: Cow<'a, str>,
    /// document body, as internal markdown
    pub body: Cow<'a, str>,
}

impl<'a> Embeddable for Document<'a> {
    fn embedding_content(&self) -> Vec<(crate::SearchKey, crate::Content<'a>)> {
        let mut fields = Vec::with_capacity(2);
        if !self.title.trim().is_empty() {
            fields.push((TITLE, self.title.clone()));
        }
        if !self.body.trim().is_empty() {
            fields.push((BODY, self.body.clone()));
        }
        fields
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys_and_text(document: &Document<'_>) -> Vec<(&'static str, String)> {
        document
            .embedding_content()
            .into_iter()
            .map(|(key, text)| (key, text.into_owned()))
            .collect()
    }

    #[test]
    fn embeds_title_when_document_has_no_body() {
        let document = Document {
            title: Cow::Borrowed("Title"),
            body: Cow::Borrowed(""),
        };

        assert_eq!(
            keys_and_text(&document),
            vec![("title", "Title".to_string())]
        );
    }

    #[test]
    fn embeds_nothing_when_document_has_no_title_or_body() {
        let document = Document {
            title: Cow::Borrowed(" "),
            body: Cow::Borrowed("\n\t"),
        };

        assert!(keys_and_text(&document).is_empty());
    }
}
