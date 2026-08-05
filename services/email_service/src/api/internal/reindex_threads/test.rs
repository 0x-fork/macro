use super::*;

fn uuid(n: u128) -> Uuid {
    Uuid::from_u128(n)
}

#[test]
fn groups_threads_by_link() {
    let link_a = uuid(100);
    let link_b = uuid(200);
    let (batches, unknown) = plan_reindex_batches(
        &[uuid(1), uuid(2), uuid(3)],
        vec![
            (uuid(1), link_a, "macro|a@example.com".into()),
            (uuid(2), link_b, "macro|b@example.com".into()),
            (uuid(3), link_a, "macro|a@example.com".into()),
        ],
    );

    assert!(unknown.is_empty());
    assert_eq!(batches.len(), 2);
    let a = batches
        .iter()
        .find(|b| b.link_id == link_a)
        .expect("link a");
    let b = batches
        .iter()
        .find(|b| b.link_id == link_b)
        .expect("link b");
    assert_eq!(a.thread_ids.len(), 2);
    assert_eq!(b.thread_ids, vec![uuid(2)]);
}

#[test]
fn chunks_at_the_batch_size() {
    let link = uuid(100);
    let requested: Vec<Uuid> = (0..125).map(uuid).collect();
    let resolved = requested
        .iter()
        .map(|id| (*id, link, "macro|a@example.com".to_string()))
        .collect();

    let (batches, unknown) = plan_reindex_batches(&requested, resolved);

    assert!(unknown.is_empty());
    assert_eq!(batches.len(), 3);
    let mut sizes: Vec<usize> = batches.iter().map(|b| b.thread_ids.len()).collect();
    sizes.sort_unstable();
    assert_eq!(sizes, vec![25, 50, 50]);
    assert_eq!(
        batches.iter().map(|b| b.thread_ids.len()).sum::<usize>(),
        125
    );
}

#[test]
fn reports_requested_ids_that_match_no_thread() {
    let (batches, unknown) = plan_reindex_batches(
        &[uuid(1), uuid(2), uuid(3)],
        vec![(uuid(2), uuid(100), "macro|a@example.com".into())],
    );

    assert_eq!(unknown, vec![uuid(1), uuid(3)]);
    assert_eq!(batches.len(), 1);
    assert_eq!(batches[0].thread_ids, vec![uuid(2)]);
}

#[test]
fn collapses_duplicate_ids() {
    let link = uuid(100);
    let (batches, unknown) = plan_reindex_batches(
        &[uuid(1), uuid(1), uuid(9), uuid(9)],
        vec![
            (uuid(1), link, "macro|a@example.com".into()),
            (uuid(1), link, "macro|a@example.com".into()),
        ],
    );

    assert_eq!(unknown, vec![uuid(9)]);
    assert_eq!(batches.len(), 1);
    assert_eq!(batches[0].thread_ids, vec![uuid(1)]);
}

#[test]
fn nothing_resolved_yields_no_batches() {
    let (batches, unknown) = plan_reindex_batches(&[uuid(1)], vec![]);

    assert!(batches.is_empty());
    assert_eq!(unknown, vec![uuid(1)]);
}

#[test]
fn same_link_with_different_owners_stays_separate() {
    let link = uuid(100);
    let (batches, _) = plan_reindex_batches(
        &[uuid(1), uuid(2)],
        vec![
            (uuid(1), link, "macro|a@example.com".into()),
            (uuid(2), link, "macro|b@example.com".into()),
        ],
    );

    assert_eq!(batches.len(), 2);
}
