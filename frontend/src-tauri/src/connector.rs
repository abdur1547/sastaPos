use async_trait::async_trait;
use futures::TryStreamExt;
use powersync::error::PowerSyncError;
use powersync::{BackendConnector, PowerSyncCredentials, PowerSyncDatabase, UpdateType};
use serde::Serialize;
use serde_json::{Map, Value};

/// Bridges the local PowerSync client to:
/// 1. The self-hosted PowerSync service (`fetch_credentials`), and
/// 2. The SastaPOS backend, which owns the source Postgres database and is responsible for
///    applying local writes queued by PowerSync (`upload_data`).
pub struct AppBackendConnector {
    db: PowerSyncDatabase,
    http: reqwest::Client,
    powersync_endpoint: String,
    backend_base_url: String,
}

impl AppBackendConnector {
    pub fn new(db: PowerSyncDatabase) -> Self {
        Self {
            db,
            http: reqwest::Client::new(),
            powersync_endpoint: std::env::var("POWERSYNC_URL")
                .unwrap_or_else(|_| "http://localhost:8080".to_string()),
            backend_base_url: std::env::var("BACKEND_API_URL")
                .unwrap_or_else(|_| "http://localhost:8081".to_string()),
        }
    }
}

#[derive(Serialize)]
struct UploadOp<'a> {
    op: &'a str,
    table: &'a str,
    id: &'a str,
    data: &'a Option<Map<String, Value>>,
}

#[async_trait]
impl BackendConnector for AppBackendConnector {
    async fn fetch_credentials(&self) -> Result<PowerSyncCredentials, PowerSyncError> {
        // TODO: replace with a real JWT fetched from the SastaPOS backend's auth endpoint once
        // it exists. Until then this reads a token generated for local testing (see
        // powersync/README.md "5. Authentication" and /client-sdks/reference/tauri docs).
        let token = std::env::var("POWERSYNC_TOKEN").map_err(|_| {
            PowerSyncError::upload_error(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "POWERSYNC_TOKEN env var is not set; see src-tauri/.env.example",
            ))
        })?;

        Ok(PowerSyncCredentials {
            endpoint: self.powersync_endpoint.clone(),
            token,
        })
    }

    async fn upload_data(&self) -> Result<(), PowerSyncError> {
        let mut transactions = self.db.crud_transactions();
        while let Some(tx) = transactions.try_next().await? {
            for entry in &tx.crud {
                let op = match entry.update_type {
                    UpdateType::Put => "PUT",
                    UpdateType::Patch => "PATCH",
                    UpdateType::Delete => "DELETE",
                };

                let body = UploadOp {
                    op,
                    table: &entry.table,
                    id: &entry.id,
                    data: &entry.data,
                };

                // TODO: the SastaPOS backend does not expose this endpoint yet. Implement a
                // route there that validates and applies these mutations to Postgres.
                self.http
                    .post(format!("{}/api/sync/upload", self.backend_base_url))
                    .json(&body)
                    .send()
                    .await
                    .map_err(PowerSyncError::upload_error)?
                    .error_for_status()
                    .map_err(PowerSyncError::upload_error)?;
            }

            tx.complete().await?;
        }

        Ok(())
    }
}
