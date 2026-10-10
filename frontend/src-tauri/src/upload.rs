//! Write path: ships queued PowerSync mutations to the backend's single upload endpoint.
//!
//! This module only knows how to build the request and how to interpret the response; it has no
//! business rules. Those live in the backend, which validates every change.

use powersync::error::PowerSyncError;
use powersync::{CrudEntry, UpdateType};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

const DEFAULT_API_BASE_URL: &str = "http://localhost:8090";
const UPLOAD_PATH: &str = "/api/sync/upload";
/// Keep below the backend's per-request limit (1000).
pub const MAX_OPERATIONS_PER_REQUEST: usize = 500;

pub fn api_base_url_from_env() -> String {
  std::env::var("API_BASE_URL")
    .ok()
    .map(|value| value.trim().trim_end_matches('/').to_string())
    .filter(|value| !value.is_empty())
    .unwrap_or_else(|| DEFAULT_API_BASE_URL.to_string())
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Operation {
  pub table: String,
  pub op: &'static str,
  pub id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub data: Option<Map<String, Value>>,
}

impl From<&CrudEntry> for Operation {
  fn from(entry: &CrudEntry) -> Self {
    Operation {
      table: entry.table.clone(),
      op: match entry.update_type {
        UpdateType::Put => "PUT",
        UpdateType::Patch => "PATCH",
        UpdateType::Delete => "DELETE",
      },
      id: entry.id.clone(),
      data: entry.data.clone(),
    }
  }
}

#[derive(Debug, Serialize)]
struct UploadRequest<'a> {
  operations: &'a [Operation],
}

#[derive(Debug, PartialEq)]
pub enum Outcome {
  /// Inspect the response; only a batch with no rejections may leave the queue.
  Done,
  /// Keep failed batches until the server accepts them; never discard local writes.
  Retry,
}

pub fn classify(status: u16) -> Outcome {
  match status {
    200..=299 => Outcome::Done,
    _ => Outcome::Retry,
  }
}

#[derive(Debug, Deserialize)]
struct UploadResponse {
  applied: usize,
  rejected: Vec<UploadRejection>,
}

#[derive(Debug, Deserialize)]
struct UploadRejection {
  table: String,
  id: String,
  reason: String,
}

fn require_accepted(body: &str) -> Result<(), PowerSyncError> {
  let response: UploadResponse = serde_json::from_str(body)
    .map_err(|err| failure(format!("invalid upload response; retaining local changes: {err}")))?;
  if !response.rejected.is_empty() {
    let rejected = response.rejected.iter()
      .map(|row| format!("{} {}: {}", row.table, row.id, row.reason))
      .collect::<Vec<_>>()
      .join("; ");
    return Err(failure(format!(
      "server applied {} changes but rejected others; retaining batch for retry: {rejected}",
      response.applied
    )));
  }
  Ok(())
}

#[derive(Debug)]
struct UploadFailed(String);

impl std::fmt::Display for UploadFailed {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "{}", self.0)
  }
}

impl std::error::Error for UploadFailed {}

fn failure(message: impl Into<String>) -> PowerSyncError {
  PowerSyncError::upload_error(UploadFailed(message.into()))
}

/// Sends one batch. `Ok(true)` means the batch may be removed from the local queue.
pub async fn send(
  client: &reqwest::Client,
  base_url: &str,
  token: &str,
  operations: &[Operation],
) -> Result<bool, PowerSyncError> {
  let response = client
    .post(format!("{base_url}{UPLOAD_PATH}"))
    .bearer_auth(token)
    .json(&UploadRequest { operations })
    .send()
    .await
    .map_err(|err| failure(format!("upload request failed: {err}")))?;

  let status = response.status().as_u16();
  let body = response.text().await
    .map_err(|err| failure(format!("could not read upload response; retaining local changes: {err}")))?;
  match classify(status) {
    Outcome::Done => {
      require_accepted(&body)?;
      Ok(true)
    }
    Outcome::Retry => Err(failure(format!("upload failed with HTTP {status}; retaining local changes: {body}"))),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn classifies_statuses() {
    assert_eq!(classify(200), Outcome::Done);
    assert_eq!(classify(204), Outcome::Done);
    assert_eq!(classify(400), Outcome::Retry);
    assert_eq!(classify(413), Outcome::Retry);
    assert_eq!(classify(422), Outcome::Retry);
    assert_eq!(classify(401), Outcome::Retry);
    assert_eq!(classify(500), Outcome::Retry);
  }

  #[test]
  fn only_acknowledges_fully_accepted_batches() {
    assert!(require_accepted(r#"{"applied":7,"rejected":[]}"#).is_ok());
    assert!(require_accepted(r#"{
      "applied": 5,
      "rejected": [
        {"table":"sales","id":"sale-1","reason":"Table is not accepted for upload"}
      ]
    }"#).is_err());
    assert!(require_accepted("not json").is_err());
    assert!(require_accepted(r#"{"applied":5}"#).is_err());
  }

  #[test]
  fn serialises_delete_without_data() {
    let op = Operation { table: "products".into(), op: "DELETE", id: "p1".into(), data: None };
    assert_eq!(
      serde_json::to_value(&op).unwrap(),
      serde_json::json!({"table": "products", "op": "DELETE", "id": "p1"})
    );
  }

  #[test]
  fn serialises_put_with_data() {
    let mut data = Map::new();
    data.insert("name".into(), Value::String("Soap".into()));
    let op = Operation { table: "products".into(), op: "PUT", id: "p1".into(), data: Some(data) };
    assert_eq!(
      serde_json::to_value(&op).unwrap(),
      serde_json::json!({"table": "products", "op": "PUT", "id": "p1", "data": {"name": "Soap"}})
    );
  }
}
