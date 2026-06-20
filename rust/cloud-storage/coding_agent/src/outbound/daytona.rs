//! [`SandboxProvider`] backed by the Daytona sandbox REST API.
//!
//! Endpoint paths follow Daytona's sandbox + toolbox API. They are factored
//! into constants so they are easy to adjust if the upstream API shifts; the
//! request/response handling and the port contract are what matter here. The
//! in-sandbox `claude-code-acp` supervisor is expected to be baked into the
//! configured snapshot image and to expose the agent over the session socket
//! returned by [`Self::agent_socket_url`].

use async_trait::async_trait;
use serde::Deserialize;

use crate::domain::error::{CodingError, Result};
use crate::domain::models::{
    GitCredentials, NetworkPolicy, ProvisionedSandbox, RepoRef, SandboxConnection, SandboxId,
    SandboxOptions, SandboxStatus,
};
use crate::domain::ports::SandboxProvider;

const SANDBOX_PATH: &str = "/sandbox";
const EXECUTE_SUBPATH: &str = "toolbox/process/execute";
const SESSION_SUBPATH: &str = "toolbox/session/macro-agent";

/// Configuration for the Daytona provider.
#[derive(Debug, Clone)]
pub struct DaytonaConfig {
    /// Base API URL, e.g. `https://api.daytona.io` (no trailing slash).
    pub base_url: String,
    /// API key (sent as `Authorization: Bearer`).
    pub api_key: String,
    /// Snapshot/image to start sandboxes from (must contain git, the repo
    /// toolchain and `claude-code-acp`). When `None`, the API default is used.
    pub default_snapshot: Option<String>,
    /// Auto-stop the sandbox after this many minutes of inactivity.
    pub auto_stop_minutes: u32,
}

/// Daytona-backed sandbox provider.
pub struct DaytonaSandboxProvider {
    client: reqwest::Client,
    config: DaytonaConfig,
}

#[derive(Deserialize)]
struct CreateSandboxResponse {
    id: String,
}

#[derive(Deserialize)]
struct SandboxStateResponse {
    #[serde(default)]
    state: Option<String>,
}

#[derive(Deserialize)]
struct SnapshotResponse {
    #[serde(default, alias = "snapshotId", alias = "id")]
    snapshot_id: Option<String>,
}

impl DaytonaSandboxProvider {
    /// Build the provider with an explicit HTTP client.
    pub fn with_client(client: reqwest::Client, config: DaytonaConfig) -> Self {
        Self { client, config }
    }

    /// Build the provider with a default HTTP client.
    pub fn new(config: DaytonaConfig) -> Self {
        Self::with_client(reqwest::Client::new(), config)
    }

    fn url(&self, suffix: &str) -> String {
        format!("{}{}", self.config.base_url.trim_end_matches('/'), suffix)
    }

    fn authed(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        builder
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("Content-Type", "application/json")
    }

    /// The WebSocket URL bridging to the in-sandbox `claude-code-acp` process.
    fn agent_socket_url(&self, sandbox_id: &str) -> String {
        let ws_base = self
            .config
            .base_url
            .trim_end_matches('/')
            .replacen("https://", "wss://", 1)
            .replacen("http://", "ws://", 1);
        format!("{ws_base}{SANDBOX_PATH}/{sandbox_id}/{SESSION_SUBPATH}/ws")
    }

    /// Run a shell command inside the sandbox via the toolbox execute API.
    async fn exec(&self, sandbox_id: &str, command: &str) -> Result<()> {
        let url = self.url(&format!("{SANDBOX_PATH}/{sandbox_id}/{EXECUTE_SUBPATH}"));
        let resp = self
            .authed(self.client.post(url))
            .json(&serde_json::json!({ "command": command }))
            .send()
            .await
            .map_err(CodingError::sandbox)?;
        if !resp.status().is_success() {
            return Err(CodingError::sandbox(format!(
                "exec failed ({}): {}",
                resp.status(),
                resp.text().await.unwrap_or_default()
            )));
        }
        Ok(())
    }

    /// Clone `repo` into the sandbox using `creds`, configuring git so the
    /// agent can later push and open a PR.
    async fn clone_repo(
        &self,
        sandbox_id: &str,
        repo: &RepoRef,
        creds: &GitCredentials,
    ) -> Result<String> {
        let workdir = format!("/workspace/{}", repo.name);
        // Token-authenticated clone URL; the token is scoped to this repo.
        let authed_url = format!(
            "https://{}:{}@github.com/{}/{}.git",
            creds.username, creds.token, repo.owner, repo.name
        );
        let branch_flag = repo
            .default_branch
            .as_deref()
            .map(|b| format!("--branch {b} "))
            .unwrap_or_default();
        let command = format!(
            "rm -rf {workdir} && git clone {branch_flag}{authed_url} {workdir} && \
             cd {workdir} && git config user.name 'macro-agent' && \
             git config user.email 'agent@macro.com'"
        );
        self.exec(sandbox_id, &command).await?;
        Ok(workdir)
    }

    fn network_env(policy: &NetworkPolicy) -> serde_json::Value {
        match policy {
            NetworkPolicy::None => serde_json::json!({ "networkBlockAll": true }),
            NetworkPolicy::Full => serde_json::json!({ "networkBlockAll": false }),
            NetworkPolicy::Allowlist(hosts) => {
                serde_json::json!({ "networkAllowList": hosts.join(",") })
            }
        }
    }
}

#[async_trait]
impl SandboxProvider for DaytonaSandboxProvider {
    fn name(&self) -> &'static str {
        "daytona"
    }

    #[tracing::instrument(skip(self, creds), fields(repo = %repo.full_name()), err)]
    async fn provision(
        &self,
        repo: &RepoRef,
        creds: &GitCredentials,
        opts: &SandboxOptions,
    ) -> Result<ProvisionedSandbox> {
        let mut body = serde_json::json!({
            "autoStopInterval": self.config.auto_stop_minutes,
            "labels": { "macro.repo": repo.full_name() },
        });
        if let Some(snapshot) = opts.snapshot.as_ref().or(self.config.default_snapshot.as_ref()) {
            body["snapshot"] = serde_json::Value::String(snapshot.clone());
        }
        // Merge the network policy fields.
        if let (Some(obj), Some(net)) = (body.as_object_mut(), Self::network_env(&opts.network).as_object()) {
            for (k, v) in net {
                obj.insert(k.clone(), v.clone());
            }
        }

        let resp = self
            .authed(self.client.post(self.url(SANDBOX_PATH)))
            .json(&body)
            .send()
            .await
            .map_err(CodingError::sandbox)?;
        if !resp.status().is_success() {
            return Err(CodingError::sandbox(format!(
                "create sandbox failed ({}): {}",
                resp.status(),
                resp.text().await.unwrap_or_default()
            )));
        }
        let created: CreateSandboxResponse = resp.json().await.map_err(CodingError::sandbox)?;

        let workdir = self.clone_repo(&created.id, repo, creds).await?;

        Ok(ProvisionedSandbox {
            id: SandboxId(created.id.clone()),
            connection: SandboxConnection {
                sandbox_id: SandboxId(created.id.clone()),
                agent_socket_url: self.agent_socket_url(&created.id),
                workdir,
            },
        })
    }

    #[tracing::instrument(skip(self), err)]
    async fn ensure_warm(&self, sandbox_id: &SandboxId) -> Result<SandboxConnection> {
        // Resume if stopped; a no-op for already-running sandboxes.
        let url = self.url(&format!("{SANDBOX_PATH}/{}/start", sandbox_id.0));
        let resp = self
            .authed(self.client.post(url))
            .send()
            .await
            .map_err(CodingError::sandbox)?;
        if !resp.status().is_success() && resp.status().as_u16() != 409 {
            return Err(CodingError::sandbox(format!(
                "start sandbox failed ({})",
                resp.status()
            )));
        }
        Ok(SandboxConnection {
            sandbox_id: sandbox_id.clone(),
            agent_socket_url: self.agent_socket_url(&sandbox_id.0),
            // The repo directory persists across stop/start.
            workdir: "/workspace".to_string(),
        })
    }

    #[tracing::instrument(skip(self), err)]
    async fn status(&self, sandbox_id: &SandboxId) -> Result<SandboxStatus> {
        let url = self.url(&format!("{SANDBOX_PATH}/{}", sandbox_id.0));
        let resp = self
            .authed(self.client.get(url))
            .send()
            .await
            .map_err(CodingError::sandbox)?;
        if resp.status().as_u16() == 404 {
            return Ok(SandboxStatus::None);
        }
        let state: SandboxStateResponse = resp.json().await.map_err(CodingError::sandbox)?;
        Ok(match state.state.as_deref() {
            Some("started") | Some("running") => SandboxStatus::Ready,
            Some("starting") | Some("creating") => SandboxStatus::Provisioning,
            Some("stopped") => SandboxStatus::Stopped,
            Some("error") => SandboxStatus::Error,
            _ => SandboxStatus::Sleeping,
        })
    }

    #[tracing::instrument(skip(self), err)]
    async fn snapshot(&self, sandbox_id: &SandboxId) -> Result<Option<String>> {
        let url = self.url(&format!("{SANDBOX_PATH}/{}/snapshot", sandbox_id.0));
        let resp = self
            .authed(self.client.post(url))
            .send()
            .await
            .map_err(CodingError::sandbox)?;
        if !resp.status().is_success() {
            return Ok(None);
        }
        let snap: SnapshotResponse = resp.json().await.unwrap_or(SnapshotResponse {
            snapshot_id: None,
        });
        Ok(snap.snapshot_id)
    }

    #[tracing::instrument(skip(self), err)]
    async fn stop(&self, sandbox_id: &SandboxId) -> Result<()> {
        let url = self.url(&format!("{SANDBOX_PATH}/{}/stop", sandbox_id.0));
        self.authed(self.client.post(url))
            .send()
            .await
            .map_err(CodingError::sandbox)?;
        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn destroy(&self, sandbox_id: &SandboxId) -> Result<()> {
        let url = self.url(&format!("{SANDBOX_PATH}/{}", sandbox_id.0));
        self.authed(self.client.delete(url))
            .send()
            .await
            .map_err(CodingError::sandbox)?;
        Ok(())
    }
}
