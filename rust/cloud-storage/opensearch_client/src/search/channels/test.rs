use super::*;
use opensearch_query_builder::ToOpenSearchJson;

#[test]
fn test_build_channel_search_request_ascending_inverts_sort() -> anyhow::Result<()> {
    let asc_args = ChannelSearchArgs {
        user_id: "user".to_string(),
        page_size: 10,
        match_type: "exact".to_string(),
        terms: vec!["test".to_string()],
        channel_ids: vec!["chan".to_string()],
        sort_direction: SortOrder::Asc,
        ..Default::default()
    };
    let asc_json = build_channel_search_request(&asc_args)?.to_json();
    let asc_sort = &asc_json["sort"];

    let desc_args = ChannelSearchArgs {
        sort_direction: SortOrder::Desc,
        ..asc_args.clone()
    };
    let desc_json = build_channel_search_request(&desc_args)?.to_json();
    let desc_sort = &desc_json["sort"];

    // Script (primary) sort flips order; entity_id (tiebreaker) flips inversely.
    assert_eq!(asc_sort[0]["_script"]["order"], "asc");
    assert_eq!(desc_sort[0]["_script"]["order"], "desc");
    assert_eq!(asc_sort[1]["entity_id"], "desc");
    assert_eq!(desc_sort[1]["entity_id"], "asc");

    Ok(())
}

#[test]
fn test_build_channel_search_request_thread_mode_ascending() -> anyhow::Result<()> {
    let args = ChannelSearchArgs {
        user_id: "user".to_string(),
        page_size: 10,
        match_type: "exact".to_string(),
        terms: vec!["test".to_string()],
        channel_ids: vec!["chan".to_string()],
        sort_mode: ChannelSortMode::Thread,
        sort_direction: SortOrder::Asc,
        ..Default::default()
    };
    let json = build_channel_search_request(&args)?.to_json();
    let sort = &json["sort"];
    // Both thread_id and message_id flip together in thread mode.
    assert_eq!(sort[0]["thread_id"]["order"], "asc");
    assert_eq!(sort[1]["message_id"]["order"], "asc");
    Ok(())
}

#[test]
fn test_build_bool_query() -> anyhow::Result<()> {
    let builder = ChannelMessageQueryBuilder::new(vec!["test".to_string()])
        .match_type("exact")
        .page_size(20)
        .page(1)
        .user_id("user123")
        .collapse(true)
        .ids(vec!["id1".to_string(), "id2".to_string()])
        .thread_ids(vec!["thread1".to_string(), "thread2".to_string()])
        .mentions(vec!["mention1".to_string(), "mention2".to_string()])
        .sender_ids(vec!["sender1".to_string(), "sender2".to_string()]);

    let result = builder.build_bool_query()?;

    let expected = serde_json::json!({
        "bool": {
            "must": [
                {
                    "bool": {
                        "minimum_should_match": 1,
                        "should": [
                            {"match_phrase": {"content": "test"}}
                        ]
                    }
                }
            ],
            "filter": [
                {
                    "bool": {
                        "minimum_should_match": 1,
                        "should": [
                            {"terms": {"entity_id": ["id1", "id2"]}},
                            {"term": {"sender_id": "user123"}}
                        ]
                    }
                },
                {"term": {"_index": "channels"}},
                {"terms": {"thread_id": ["thread1", "thread2"]}},
                {"terms": {"mentions": ["mention1", "mention2"]}},
                {"terms": {"sender_id": ["sender1", "sender2"]}}
            ]
        }
    });

    assert_eq!(result.build().to_json(), expected);

    Ok(())
}
