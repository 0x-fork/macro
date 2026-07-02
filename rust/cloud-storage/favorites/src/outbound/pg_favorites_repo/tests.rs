use cowlike::CowLike;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::EntityType;
use sqlx::PgPool;
use uuid::Uuid;

use super::PgFavoritesRepo;
use crate::domain::models::{FavoriteOwner, FavoriteScope};
use crate::domain::ports::FavoritesRepo;

const USER_A: &str = "macro|user-a@macro.com";
const USER_B: &str = "macro|user-b@macro.com";

fn user(id: &str) -> MacroUserIdStr<'_> {
    MacroUserIdStr::parse_from_str(id).expect("valid user id")
}

async fn insert_user(pool: &PgPool, id: &str) {
    let macro_user_id = Uuid::now_v7();
    sqlx::query(
        r#"INSERT INTO macro_user (id, username, email, stripe_customer_id) VALUES ($1, $2, $2, $2)"#,
    )
    .bind(macro_user_id)
    .bind(id)
    .execute(pool)
    .await
    .expect("macro_user should insert");
    sqlx::query(r#"INSERT INTO "User" (id, email, macro_user_id) VALUES ($1, $1, $2)"#)
        .bind(id)
        .bind(macro_user_id)
        .execute(pool)
        .await
        .expect("user should insert");
}

async fn insert_team(pool: &PgPool, owner: &str, members: &[&str]) -> Uuid {
    let team_id = Uuid::now_v7();
    sqlx::query(r#"INSERT INTO "team" (id, name, owner_id) VALUES ($1, 'test team', $2)"#)
        .bind(team_id)
        .bind(owner)
        .execute(pool)
        .await
        .expect("team should insert");
    for member in members {
        sqlx::query(
            r#"INSERT INTO "team_user" (user_id, team_id, team_role) VALUES ($1, $2, 'member')"#,
        )
        .bind(member)
        .bind(team_id)
        .execute(pool)
        .await
        .expect("team member should insert");
    }
    team_id
}

async fn insert_document(pool: &PgPool, id: &str, name: &str, owner: &str) {
    sqlx::query(r#"INSERT INTO "Document" (id, name, owner) VALUES ($1, $2, $3)"#)
        .bind(id)
        .bind(name)
        .bind(owner)
        .execute(pool)
        .await
        .expect("document should insert");
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn add_favorite_appends_and_is_idempotent(pool: PgPool) {
    insert_user(&pool, USER_A).await;
    let repo = PgFavoritesRepo::new(pool);
    let owner = FavoriteOwner::User(user(USER_A));

    let first = repo
        .add_favorite(
            &owner,
            &EntityType::Document.with_entity_str("doc-1"),
            &user(USER_A),
        )
        .await
        .expect("first favorite should insert");
    let second = repo
        .add_favorite(
            &owner,
            &EntityType::Channel.with_entity_str("chan-1"),
            &user(USER_A),
        )
        .await
        .expect("second favorite should insert");
    assert!(second.sort_order > first.sort_order);
    assert_eq!(first.scope, FavoriteScope::User);

    let duplicate = repo
        .add_favorite(
            &owner,
            &EntityType::Document.with_entity_str("doc-1"),
            &user(USER_A),
        )
        .await
        .expect("duplicate favorite should be a no-op");
    assert_eq!(duplicate.id, first.id);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn list_favorites_hydrates_names_and_skips_deleted(pool: PgPool) {
    insert_user(&pool, USER_A).await;
    insert_document(&pool, "doc-live", "Launch plan", USER_A).await;
    insert_document(&pool, "doc-gone", "Old doc", USER_A).await;
    sqlx::query(r#"UPDATE "Document" SET "deletedAt" = now() WHERE id = 'doc-gone'"#)
        .execute(&pool)
        .await
        .expect("document should soft delete");

    let repo = PgFavoritesRepo::new(pool);
    let owner = FavoriteOwner::User(user(USER_A));
    for entity_id in ["doc-live", "doc-gone"] {
        repo.add_favorite(
            &owner,
            &EntityType::Document.with_entity_str(entity_id),
            &user(USER_A),
        )
        .await
        .expect("favorite should insert");
    }
    // An entity with no local table (e.g. a foreign id) still lists, unhydrated.
    repo.add_favorite(
        &owner,
        &EntityType::EmailThread.with_entity_str(&Uuid::now_v7().to_string()),
        &user(USER_A),
    )
    .await
    .expect("email favorite should insert");

    let favorites = repo
        .list_favorites(&owner)
        .await
        .expect("favorites should list");
    assert_eq!(favorites.len(), 2);
    assert_eq!(favorites[0].entity_id, "doc-live");
    assert_eq!(favorites[0].name.as_deref(), Some("Launch plan"));
    assert_eq!(favorites[1].entity_type, EntityType::EmailThread);
    assert_eq!(favorites[1].name, None);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn remove_favorite_by_id_checks_ownership(pool: PgPool) {
    insert_user(&pool, USER_A).await;
    insert_user(&pool, USER_B).await;
    let repo = PgFavoritesRepo::new(pool);
    let owner = FavoriteOwner::User(user(USER_A));

    let favorite = repo
        .add_favorite(
            &owner,
            &EntityType::Document.with_entity_str("doc-1"),
            &user(USER_A),
        )
        .await
        .expect("favorite should insert");

    let removed_by_other = repo
        .remove_favorite_by_id(&user(USER_B), favorite.id)
        .await
        .expect("delete by non-owner should run");
    assert!(!removed_by_other);

    let removed = repo
        .remove_favorite_by_id(&user(USER_A), favorite.id)
        .await
        .expect("delete by owner should run");
    assert!(removed);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn team_favorites_are_shared_and_removable_by_members(pool: PgPool) {
    insert_user(&pool, USER_A).await;
    insert_user(&pool, USER_B).await;
    let team_id = insert_team(&pool, USER_A, &[USER_A, USER_B]).await;
    let repo = PgFavoritesRepo::new(pool);
    let owner = FavoriteOwner::Team(team_id);

    let favorite = repo
        .add_favorite(
            &owner,
            &EntityType::Channel.with_entity_str("chan-1"),
            &user(USER_A),
        )
        .await
        .expect("team favorite should insert");
    assert_eq!(favorite.scope, FavoriteScope::Team);

    // Another member of the team can remove it by id.
    let removed = repo
        .remove_favorite_by_id(&user(USER_B), favorite.id)
        .await
        .expect("delete by team member should run");
    assert!(removed);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn remove_favorite_by_entity_scopes_to_owner(pool: PgPool) {
    insert_user(&pool, USER_A).await;
    insert_document(&pool, "doc-1", "Doc 1", USER_A).await;
    let team_id = insert_team(&pool, USER_A, &[USER_A]).await;
    let repo = PgFavoritesRepo::new(pool);
    let entity = EntityType::Document.with_entity_str("doc-1");

    repo.add_favorite(&FavoriteOwner::User(user(USER_A)), &entity, &user(USER_A))
        .await
        .expect("user favorite should insert");
    repo.add_favorite(&FavoriteOwner::Team(team_id), &entity, &user(USER_A))
        .await
        .expect("team favorite should insert");

    let removed = repo
        .remove_favorite_by_entity(&FavoriteOwner::User(user(USER_A)), &entity)
        .await
        .expect("user unfavorite should run");
    assert!(removed);

    // The team favorite for the same entity is untouched.
    let team_favorites = repo
        .list_favorites(&FavoriteOwner::Team(team_id))
        .await
        .expect("team favorites should list");
    assert_eq!(team_favorites.len(), 1);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn reorder_favorites_sets_manual_order(pool: PgPool) {
    insert_user(&pool, USER_A).await;
    for entity_id in ["a", "b", "c"] {
        insert_document(&pool, entity_id, entity_id, USER_A).await;
    }
    let repo = PgFavoritesRepo::new(pool);
    let owner = FavoriteOwner::User(user(USER_A));

    let mut ids = Vec::new();
    for entity_id in ["a", "b", "c"] {
        let favorite = repo
            .add_favorite(
                &owner,
                &EntityType::Document.with_entity_str(entity_id),
                &user(USER_A),
            )
            .await
            .expect("favorite should insert");
        ids.push(favorite.id);
    }

    ids.reverse();
    repo.reorder_favorites(&owner, &ids)
        .await
        .expect("reorder should run");

    let favorites = repo
        .list_favorites(&owner)
        .await
        .expect("favorites should list");
    let listed: Vec<Uuid> = favorites.iter().map(|f| f.id).collect();
    assert_eq!(listed, ids);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn favorited_entities_covers_user_and_team_scopes(pool: PgPool) {
    insert_user(&pool, USER_A).await;
    insert_user(&pool, USER_B).await;
    let team_id = insert_team(&pool, USER_A, &[USER_A, USER_B]).await;
    let repo = PgFavoritesRepo::new(pool);

    let user_entity = EntityType::Document.with_entity_str("doc-user");
    let team_entity = EntityType::Channel.with_entity_str("chan-team");
    let other_entity = EntityType::Chat.with_entity_str("chat-other");

    repo.add_favorite(
        &FavoriteOwner::User(user(USER_A)),
        &user_entity,
        &user(USER_A),
    )
    .await
    .expect("user favorite should insert");
    repo.add_favorite(&FavoriteOwner::Team(team_id), &team_entity, &user(USER_B))
        .await
        .expect("team favorite should insert");

    let favorited = repo
        .favorited_entities(
            &user(USER_A),
            &[
                user_entity.copied(),
                team_entity.copied(),
                other_entity.copied(),
            ],
        )
        .await
        .expect("favorited lookup should run");

    assert_eq!(favorited.len(), 2);
    assert!(favorited.contains(&user_entity));
    assert!(favorited.contains(&team_entity));
    assert!(!favorited.contains(&other_entity));

    // USER_B did not personally favorite doc-user, but shares the team favorite.
    let favorited_b = repo
        .favorited_entities(&user(USER_B), &[user_entity.copied(), team_entity.copied()])
        .await
        .expect("favorited lookup should run");
    assert_eq!(favorited_b.len(), 1);
    assert!(favorited_b.contains(&team_entity));
}
