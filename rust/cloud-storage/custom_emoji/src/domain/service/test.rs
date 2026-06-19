use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use chrono::Utc;
use macro_user_id::user_id::MacroUserIdStr;
use uuid::Uuid;

use super::{CustomEmojiServiceImpl, MAX_RESOLVE_IDS, MAX_SLUG_LEN, validate_slug};
use crate::domain::model::{
    CreateCustomEmojiError, CustomEmoji, CustomEmojiError, DeleteCustomEmojiError,
};
use crate::domain::ports::{CustomEmojiRepository, CustomEmojiService};

/// Configurable in-memory repository for service-level tests.
#[derive(Clone, Default)]
struct FakeRepo {
    is_member: bool,
    create_conflict: bool,
    delete_found: bool,
    resolve_calls: Arc<AtomicUsize>,
}

impl CustomEmojiRepository for FakeRepo {
    async fn team_ids_for_user(
        &self,
        _user_id: &MacroUserIdStr<'_>,
    ) -> Result<Vec<Uuid>, CustomEmojiError> {
        Ok(Vec::new())
    }

    async fn is_team_member(
        &self,
        _user_id: &MacroUserIdStr<'_>,
        _team_id: &Uuid,
    ) -> Result<bool, CustomEmojiError> {
        Ok(self.is_member)
    }

    async fn create(
        &self,
        team_id: &Uuid,
        slug: &str,
        sfs_file_id: &str,
        created_by: &MacroUserIdStr<'_>,
    ) -> Result<CustomEmoji, CreateCustomEmojiError> {
        if self.create_conflict {
            return Err(CreateCustomEmojiError::SlugAlreadyExists);
        }
        Ok(CustomEmoji {
            id: Uuid::nil(),
            team_id: *team_id,
            slug: slug.to_string(),
            sfs_file_id: sfs_file_id.to_string(),
            created_by: created_by.as_ref().to_string(),
            created_at: Utc::now(),
        })
    }

    async fn list_for_teams(
        &self,
        _team_ids: &[Uuid],
    ) -> Result<Vec<CustomEmoji>, CustomEmojiError> {
        Ok(Vec::new())
    }

    async fn resolve_by_ids(&self, _ids: &[Uuid]) -> Result<Vec<CustomEmoji>, CustomEmojiError> {
        self.resolve_calls.fetch_add(1, Ordering::SeqCst);
        Ok(Vec::new())
    }

    async fn soft_delete(
        &self,
        _id: &Uuid,
        _user_id: &MacroUserIdStr<'_>,
    ) -> Result<bool, DeleteCustomEmojiError> {
        Ok(self.delete_found)
    }
}

fn user() -> MacroUserIdStr<'static> {
    MacroUserIdStr::parse_from_str("macro|test@example.com").unwrap()
}

fn service(repo: FakeRepo) -> CustomEmojiServiceImpl<FakeRepo> {
    CustomEmojiServiceImpl::new(repo)
}

#[test]
fn validate_slug_accepts_valid_slugs() {
    assert!(validate_slug("a").is_ok());
    assert!(validate_slug("party_parrot").is_ok());
    assert!(validate_slug("a-b-1").is_ok());
    assert!(validate_slug(&"a".repeat(MAX_SLUG_LEN)).is_ok());
}

#[test]
fn validate_slug_rejects_invalid_slugs() {
    let cases = ["", "Party", "_lead", "-lead", "hi there", "emoji!", "🎉"];
    for case in cases {
        assert!(
            matches!(
                validate_slug(case),
                Err(CreateCustomEmojiError::InvalidSlug(_))
            ),
            "expected {case:?} to be rejected"
        );
    }
    // One past the max length.
    assert!(validate_slug(&"a".repeat(MAX_SLUG_LEN + 1)).is_err());
}

#[tokio::test]
async fn create_succeeds_for_team_member() {
    let svc = service(FakeRepo {
        is_member: true,
        ..Default::default()
    });
    let emoji = svc
        .create(&user(), &Uuid::nil(), "party", "file-1")
        .await
        .expect("create should succeed");
    assert_eq!(emoji.slug, "party");
}

#[tokio::test]
async fn create_rejects_non_team_member() {
    let svc = service(FakeRepo {
        is_member: false,
        ..Default::default()
    });
    let res = svc.create(&user(), &Uuid::nil(), "party", "file-1").await;
    assert!(matches!(res, Err(CreateCustomEmojiError::NotTeamMember(_))));
}

#[tokio::test]
async fn create_validates_slug_before_membership() {
    // Even a non-member gets the slug error first (validation precedes the
    // membership check), so an invalid slug never leaks membership info.
    let svc = service(FakeRepo {
        is_member: false,
        ..Default::default()
    });
    let res = svc
        .create(&user(), &Uuid::nil(), "Bad Slug", "file-1")
        .await;
    assert!(matches!(res, Err(CreateCustomEmojiError::InvalidSlug(_))));
}

// The actual unique-violation -> SlugAlreadyExists mapping lives in the repo
// (sqlx) layer; here we only assert the service propagates that error.
#[tokio::test]
async fn create_propagates_slug_exists_from_repo() {
    let svc = service(FakeRepo {
        is_member: true,
        create_conflict: true,
        ..Default::default()
    });
    let res = svc.create(&user(), &Uuid::nil(), "party", "file-1").await;
    assert!(matches!(
        res,
        Err(CreateCustomEmojiError::SlugAlreadyExists)
    ));
}

#[tokio::test]
async fn delete_returns_not_found_when_no_row_affected() {
    let svc = service(FakeRepo {
        delete_found: false,
        ..Default::default()
    });
    let res = svc.delete(&user(), &Uuid::nil()).await;
    assert!(matches!(res, Err(DeleteCustomEmojiError::NotFound)));
}

#[tokio::test]
async fn delete_succeeds_when_row_affected() {
    let svc = service(FakeRepo {
        delete_found: true,
        ..Default::default()
    });
    assert!(svc.delete(&user(), &Uuid::nil()).await.is_ok());
}

#[tokio::test]
async fn resolve_rejects_oversized_batch() {
    let svc = service(FakeRepo::default());
    let ids = vec![Uuid::nil(); MAX_RESOLVE_IDS + 1];
    let res = svc.resolve(&ids).await;
    assert!(matches!(res, Err(CustomEmojiError::TooManyIds { .. })));
}

#[tokio::test]
async fn resolve_empty_returns_empty_without_hitting_repo() {
    let repo = FakeRepo::default();
    let resolve_calls = repo.resolve_calls.clone();
    let svc = service(repo);

    assert!(svc.resolve(&[]).await.unwrap().is_empty());
    assert_eq!(
        resolve_calls.load(Ordering::SeqCst),
        0,
        "empty input should short-circuit before the repo"
    );
}
