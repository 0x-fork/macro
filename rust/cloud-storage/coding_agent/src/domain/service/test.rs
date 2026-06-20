use std::sync::Arc;

use super::*;
use crate::domain::models::StopReason;
use crate::outbound::mock::{
    InMemoryProvider, InMemoryRegistry, ScriptedRunner, StaticCredentialProvider,
};

fn service() -> CodingSessionServiceImpl {
    let backend = CodingBackend::new(
        Arc::new(InMemoryProvider::new()),
        Arc::new(ScriptedRunner::instant()),
    );
    CodingSessionServiceImpl::new(
        backend,
        Arc::new(InMemoryRegistry::new()),
        Arc::new(StaticCredentialProvider::new("test-token")),
    )
}

#[tokio::test]
async fn select_repository_records_and_prewarms() {
    let svc = service();
    let repo = RepoRef::parse("macro-inc/macro").unwrap();

    let record = svc
        .select_repository("chat-1", "user-1", repo)
        .await
        .unwrap();
    assert_eq!(record.repo, "macro-inc/macro");
    assert!(svc.can_delegate("chat-1").await.unwrap());

    // Give the background pre-warm a moment to provision.
    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    let after = svc.get_record("chat-1").await.unwrap().unwrap();
    assert!(matches!(
        after.status,
        SandboxStatus::Ready | SandboxStatus::Provisioning
    ));
}

#[tokio::test]
async fn delegate_streams_events_and_opens_pr() {
    let svc = service();
    let repo = RepoRef::parse("macro-inc/macro").unwrap();
    svc.select_repository("chat-2", "user-1", repo)
        .await
        .unwrap();

    let (sink, mut rx) = CodingEventSink::channel();
    let outcome = svc
        .delegate("chat-2", "user-1", "add a greeting", sink)
        .await
        .unwrap();

    assert_eq!(outcome.stop_reason, StopReason::EndTurn);
    let pr = outcome.pr.expect("a PR should be opened");
    assert_eq!(pr.number, 42);

    // The stream should contain a session start, a diff, and a finish.
    let mut saw_session = false;
    let mut saw_diff = false;
    let mut saw_finish = false;
    while let Ok(ev) = rx.try_recv() {
        match ev {
            CodingEvent::SessionStarted { .. } => saw_session = true,
            CodingEvent::Diff { .. } => saw_diff = true,
            CodingEvent::Finished { .. } => saw_finish = true,
            _ => {}
        }
    }
    assert!(saw_session && saw_diff && saw_finish);
}

#[tokio::test]
async fn delegate_without_repo_errors() {
    let svc = service();
    let (sink, _rx) = CodingEventSink::channel();
    let err = svc
        .delegate("missing-chat", "user-1", "do something", sink)
        .await
        .unwrap_err();
    assert!(matches!(err, CodingError::NoRepositorySelected));
}
