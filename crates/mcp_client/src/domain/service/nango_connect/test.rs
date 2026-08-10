use super::*;
use crate::domain::models::{NangoConnectSession, NangoConnection, NangoEndUser};
use macro_user_id::cowlike::CowLike;
use std::collections::HashMap;
use std::sync::Mutex;

/// In-memory [`McpServerStore`] fake keyed by (user, url).
struct FakeServerStore {
    rows: Mutex<HashMap<(String, String), McpServerRecord>>,
}

impl FakeServerStore {
    fn new() -> Self {
        Self {
            rows: Mutex::new(HashMap::new()),
        }
    }

    fn insert(&self, record: McpServerRecord) {
        self.rows.lock().unwrap().insert(
            (record.user_id.as_ref().to_owned(), record.url.clone()),
            record,
        );
    }
}

impl McpServerStore for FakeServerStore {
    type Err = anyhow::Error;

    async fn save(&self, record: &McpServerRecord) -> Result<(), Self::Err> {
        self.insert(record.clone());
        Ok(())
    }

    async fn load(
        &self,
        user_id: &MacroUserIdStr<'static>,
        server_url: &str,
    ) -> Result<Option<McpServerRecord>, Self::Err> {
        Ok(self
            .rows
            .lock()
            .unwrap()
            .get(&(user_id.as_ref().to_owned(), server_url.to_owned()))
            .cloned())
    }

    async fn delete(
        &self,
        _user_id: &MacroUserIdStr<'static>,
        _server_url: &str,
    ) -> Result<(), Self::Err> {
        unimplemented!()
    }

    async fn list(
        &self,
        _user_id: &MacroUserIdStr<'static>,
    ) -> Result<Vec<McpServerRecord>, Self::Err> {
        unimplemented!()
    }
}

/// [`NangoConnectService`] fake serving a single connection.
struct FakeNango {
    connection: Option<NangoConnection>,
}

impl NangoConnectService for FakeNango {
    async fn create_connect_session(
        &self,
        _end_user: NangoEndUser,
        _mcp_server_url: Option<&str>,
    ) -> anyhow::Result<NangoConnectSession> {
        unimplemented!()
    }

    async fn get_connection(&self, connection_id: &str) -> anyhow::Result<Option<NangoConnection>> {
        Ok(self
            .connection
            .clone()
            .filter(|c| c.connection_id == connection_id))
    }

    async fn fresh_token(&self, _connection_id: &str) -> anyhow::Result<String> {
        unimplemented!()
    }

    async fn delete_connection(&self, _connection_id: &str) -> anyhow::Result<()> {
        unimplemented!()
    }
}

fn user_id() -> MacroUserIdStr<'static> {
    MacroUserIdStr::parse_from_str("macro|test@example.com")
        .unwrap()
        .into_owned()
}

fn nango_with(connection_id: &str, end_user_id: &str, url: Option<&str>) -> FakeNango {
    FakeNango {
        connection: Some(NangoConnection {
            connection_id: connection_id.to_owned(),
            end_user_id: Some(end_user_id.to_owned()),
            mcp_server_url: url.map(str::to_owned),
        }),
    }
}

#[tokio::test]
async fn creates_record_for_new_server() {
    let store = FakeServerStore::new();
    let nango = nango_with(
        "conn-1",
        "macro|test@example.com",
        Some("https://mcp.example.com/mcp"),
    );

    let record = complete_nango_connection(&store, &nango, &user_id(), "conn-1", None)
        .await
        .unwrap();

    assert_eq!(record.url, "https://mcp.example.com/mcp");
    assert_eq!(record.server_name, "mcp.example.com");
    assert_eq!(record.nango_connection_id.as_deref(), Some("conn-1"));
    assert!(record.enabled);
    assert!(record.is_authenticated());

    let stored = store
        .load(&user_id(), "https://mcp.example.com/mcp")
        .await
        .unwrap()
        .expect("record persisted");
    assert_eq!(stored.nango_connection_id.as_deref(), Some("conn-1"));
}

#[tokio::test]
async fn uses_provided_server_name() {
    let store = FakeServerStore::new();
    let nango = nango_with(
        "conn-1",
        "macro|test@example.com",
        Some("https://mcp.example.com/mcp"),
    );

    let record = complete_nango_connection(
        &store,
        &nango,
        &user_id(),
        "conn-1",
        Some("Example".to_owned()),
    )
    .await
    .unwrap();

    assert_eq!(record.server_name, "Example");
}

#[tokio::test]
async fn preserves_existing_row_state_on_reconnect() {
    let store = FakeServerStore::new();
    store.insert(McpServerRecord {
        user_id: user_id(),
        url: "https://mcp.example.com/mcp".to_owned(),
        server_name: "My Server".to_owned(),
        credentials: None,
        enabled: false,
        nango_connection_id: Some("conn-old".to_owned()),
        bearer_token: None,
    });
    let nango = nango_with(
        "conn-2",
        "macro|test@example.com",
        Some("https://mcp.example.com/mcp"),
    );

    let record = complete_nango_connection(&store, &nango, &user_id(), "conn-2", None)
        .await
        .unwrap();

    // The grant is replaced; the user's name and enabled choices survive.
    assert_eq!(record.nango_connection_id.as_deref(), Some("conn-2"));
    assert_eq!(record.server_name, "My Server");
    assert!(!record.enabled);
}

#[tokio::test]
async fn rejects_connection_owned_by_another_user() {
    let store = FakeServerStore::new();
    let nango = nango_with(
        "conn-1",
        "macro|other@example.com",
        Some("https://mcp.example.com/mcp"),
    );

    let err = complete_nango_connection(&store, &nango, &user_id(), "conn-1", None)
        .await
        .unwrap_err();

    assert!(matches!(err, NangoConnectError::NotFound));
    assert!(
        store
            .load(&user_id(), "https://mcp.example.com/mcp")
            .await
            .unwrap()
            .is_none(),
        "nothing persisted for the probing user"
    );
}

#[tokio::test]
async fn rejects_unknown_connection() {
    let store = FakeServerStore::new();
    let nango = nango_with(
        "conn-1",
        "macro|test@example.com",
        Some("https://mcp.example.com/mcp"),
    );

    let err = complete_nango_connection(&store, &nango, &user_id(), "conn-missing", None)
        .await
        .unwrap_err();

    assert!(matches!(err, NangoConnectError::NotFound));
}

#[tokio::test]
async fn rejects_connection_without_server_url() {
    let store = FakeServerStore::new();
    let nango = nango_with("conn-1", "macro|test@example.com", None);

    let err = complete_nango_connection(&store, &nango, &user_id(), "conn-1", None)
        .await
        .unwrap_err();

    assert!(matches!(err, NangoConnectError::MissingServerUrl));
}
