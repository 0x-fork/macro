use super::PgTeamMemoryRepo;
use crate::domain::{MemoryError, TeamMemoryRepo};
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use macro_user_id::user_id::MacroUserIdStr;
use macro_uuid::Uuid;
use sqlx::{Pool, Postgres};

async fn create_team(pool: &Pool<Postgres>, name: &str, owner_id: &str) -> Uuid {
    let team_id = macro_uuid::generate_uuid_v7();
    sqlx::query!(
        "INSERT INTO team (id, name, owner_id) VALUES ($1, $2, $3)",
        team_id,
        name,
        owner_id,
    )
    .execute(pool)
    .await
    .unwrap();
    team_id
}

async fn add_member(pool: &Pool<Postgres>, team_id: Uuid, user_id: &str, role: &str) {
    sqlx::query!(
        "INSERT INTO team_user (user_id, team_id, team_role) VALUES ($1, $2, ($3::text)::team_role)",
        user_id,
        team_id,
        role,
    )
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn save_and_get_by_id(pool: Pool<Postgres>) {
    let team_id = create_team(&pool, "acme", "macro|owner@example.com").await;
    let repo = PgTeamMemoryRepo::new(pool);
    let memory_text = "Team builds cloud infra for enterprise customers".to_string();

    let id = repo.save_team_memory(&memory_text, team_id).await.unwrap();
    let fetched = repo.get_team_memory_by_id(team_id, id).await.unwrap();

    assert_eq!(fetched, memory_text);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn get_latest_returns_most_recent(pool: Pool<Postgres>) {
    let team_id = create_team(&pool, "acme", "macro|owner@example.com").await;
    let repo = PgTeamMemoryRepo::new(pool);

    repo.save_team_memory(&"first memory".to_string(), team_id)
        .await
        .unwrap();
    repo.save_team_memory(&"second memory".to_string(), team_id)
        .await
        .unwrap();

    let record = repo.get_latest_team_memory(team_id).await.unwrap().unwrap();
    assert_eq!(record.memory, "second memory");
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn get_latest_no_memories_returns_none(pool: Pool<Postgres>) {
    let team_id = create_team(&pool, "acme", "macro|owner@example.com").await;
    let repo = PgTeamMemoryRepo::new(pool);

    let result = repo.get_latest_team_memory(team_id).await.unwrap();
    assert!(result.is_none());
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn get_by_id_wrong_team_returns_error(pool: Pool<Postgres>) {
    let team_a = create_team(&pool, "team-a", "macro|owner-a@example.com").await;
    let team_b = create_team(&pool, "team-b", "macro|owner-b@example.com").await;
    let repo = PgTeamMemoryRepo::new(pool);

    let id = repo
        .save_team_memory(&"team a memory".to_string(), team_a)
        .await
        .unwrap();

    let result = repo.get_team_memory_by_id(team_b, id).await;
    assert!(matches!(result, Err(MemoryError::NoGeneration)));
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn memories_are_scoped_to_team(pool: Pool<Postgres>) {
    let team_a = create_team(&pool, "team-a", "macro|owner-a@example.com").await;
    let team_b = create_team(&pool, "team-b", "macro|owner-b@example.com").await;
    let repo = PgTeamMemoryRepo::new(pool);

    repo.save_team_memory(&"team a memory".to_string(), team_a)
        .await
        .unwrap();
    repo.save_team_memory(&"team b memory".to_string(), team_b)
        .await
        .unwrap();

    let latest_a = repo.get_latest_team_memory(team_a).await.unwrap().unwrap();
    let latest_b = repo.get_latest_team_memory(team_b).await.unwrap().unwrap();

    assert_eq!(latest_a.memory, "team a memory");
    assert_eq!(latest_b.memory, "team b memory");
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn deleting_team_deletes_its_memory(pool: Pool<Postgres>) {
    let team_id = create_team(&pool, "acme", "macro|owner@example.com").await;
    let repo = PgTeamMemoryRepo::new(pool.clone());

    repo.save_team_memory(&"a memory".to_string(), team_id)
        .await
        .unwrap();

    sqlx::query!("DELETE FROM team WHERE id = $1", team_id)
        .execute(&pool)
        .await
        .unwrap();

    let result = repo.get_latest_team_memory(team_id).await.unwrap();
    assert!(result.is_none());
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn get_user_team_id_returns_membership(pool: Pool<Postgres>) {
    let team_id = create_team(&pool, "acme", "macro|owner@example.com").await;
    add_member(&pool, team_id, "macro|member@example.com", "member").await;
    let repo = PgTeamMemoryRepo::new(pool);

    let user = MacroUserIdStr::parse_from_str("macro|member@example.com").unwrap();
    let result = repo.get_user_team_id(user).await.unwrap();

    assert_eq!(result, Some(team_id));
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn get_user_team_id_returns_none_without_membership(pool: Pool<Postgres>) {
    let repo = PgTeamMemoryRepo::new(pool);

    let user = MacroUserIdStr::parse_from_str("macro|loner@example.com").unwrap();
    let result = repo.get_user_team_id(user).await.unwrap();

    assert_eq!(result, None);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn get_team_overview_returns_name_and_members(pool: Pool<Postgres>) {
    let team_id = create_team(&pool, "acme", "macro|owner@example.com").await;
    add_member(&pool, team_id, "macro|owner@example.com", "owner").await;
    add_member(&pool, team_id, "macro|member@example.com", "member").await;
    let repo = PgTeamMemoryRepo::new(pool);

    let overview = repo.get_team_overview(team_id).await.unwrap().unwrap();

    assert_eq!(overview.name, "acme");
    let mut members = overview.member_ids;
    members.sort();
    assert_eq!(
        members,
        vec![
            "macro|member@example.com".to_string(),
            "macro|owner@example.com".to_string(),
        ]
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn get_team_overview_with_no_members_returns_empty_list(pool: Pool<Postgres>) {
    let team_id = create_team(&pool, "acme", "macro|owner@example.com").await;
    let repo = PgTeamMemoryRepo::new(pool);

    let overview = repo.get_team_overview(team_id).await.unwrap().unwrap();

    assert_eq!(overview.name, "acme");
    assert!(overview.member_ids.is_empty());
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn get_team_overview_missing_team_returns_none(pool: Pool<Postgres>) {
    let repo = PgTeamMemoryRepo::new(pool);

    let overview = repo
        .get_team_overview(macro_uuid::generate_uuid_v7())
        .await
        .unwrap();

    assert!(overview.is_none());
}
