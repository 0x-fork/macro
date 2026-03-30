use super::*;

use opensearch_query_builder::ToOpenSearchJson;

#[test]
fn test_query_key_from_match_type() -> anyhow::Result<()> {
    assert_eq!(QueryKey::from_match_type("exact")?, QueryKey::MatchPhrase);
    assert_eq!(
        QueryKey::from_match_type("partial")?,
        QueryKey::MatchPhrasePrefix
    );
    assert_eq!(QueryKey::from_match_type("regexp")?, QueryKey::Regexp);

    let error = QueryKey::from_match_type("invalid").unwrap_err();

    assert_eq!(
        error,
        OpensearchClientError::InvalidMatchType {
            match_type: "invalid".to_string()
        }
    );

    Ok(())
}

#[test]
fn test_query_key_create_query_exact() -> anyhow::Result<()> {
    let expected = serde_json::json!({
        "match_phrase": {
            "content": "test"
        }
    });

    let result = create_query(CreateQueryParams {
        query_key: QueryKey::MatchPhrase,
        field: "content",
        prefixed_field: "content_prefixed",
        term: "test",
    })
    .to_json();

    assert_eq!(result, expected);

    Ok(())
}

#[test]
fn test_query_key_create_query_partial() -> anyhow::Result<()> {
    let expected = serde_json::json!({
        "match_phrase_prefix": {
            "content_prefixed": {
                "query": "test Ab"
            }
        }
    });

    let result = create_query(CreateQueryParams {
        query_key: QueryKey::MatchPhrasePrefix,
        field: "content",
        prefixed_field: "content_prefixed",
        term: "test Ab",
    })
    .to_json();

    assert_eq!(result, expected);

    Ok(())
}

#[test]
fn test_generate_terms_must_query() -> anyhow::Result<()> {
    let terms: Cow<'_, [&str]> = Cow::Borrowed(&["test"]);

    let result =
        generate_terms_must_query(QueryKey::MatchPhrase, "content", "content_prefixed", terms);

    let expected = serde_json::json!({
        "match_phrase": {
            "content": "test"
        }
    });

    assert_eq!(result.to_json(), expected);

    let terms: Cow<'_, [&str]> = Cow::Borrowed(&["test", "test2"]);
    let result = generate_terms_must_query(
        QueryKey::MatchPhrasePrefix,
        "content",
        "content_prefixed",
        terms,
    );

    let expected = serde_json::json!({
        "bool": {
            "minimum_should_match": 1,
            "should": [
                {
                    "match_phrase_prefix": {
                        "content_prefixed": {
                            "query": "test"
                        }
                    }
                },
                {
                    "match_phrase_prefix": {
                        "content_prefixed": {
                            "query": "test2"
                        }
                    }
                }
            ]
        }
    });

    assert_eq!(result.to_json(), expected);

    Ok(())
}
