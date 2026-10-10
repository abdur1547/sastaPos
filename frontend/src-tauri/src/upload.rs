//! Write path: ships queued PowerSync mutations to the backend's single upload endpoint.
//!
//! This module only knows how to build the request and how to interpret the response; it has no
//! business rules. Those live in the backend, which validates every change.

use powersync::error::PowerSyncError;
use powersync::{CrudEntry, UpdateType};
use serde::Serialize;
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
  /// The batch was handled (rejected rows included); remove it from the queue.
  Done,
  /// The server will never accept this batch as-is; drop it so the queue is not blocked forever.
  Discard,
  /// Transient or auth problem; keep the queue and let the SDK retry.
  Retry,
}

pub fn classify(status: u16) -> Outcome {
  match status {
    200..=299 => Outcome::Done,
    400 | 413 | 422 => Outcome::Discard,
    _ => Outcome::Retry,
  }
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
  let body = response.text().await.unwrap_or_default();
  match classify(status) {
    Outcome::Done => {
      if body.contains("\"rejected\":[{") {
        log::warn!("server rejected some changes: {body}");
      }
      Ok(true)
    }
    Outcome::Discard => {
      log::error!("dropping un-uploadable batch (HTTP {status}): {body}");
      Ok(true)
    }
    Outcome::Retry => Err(failure(format!("upload failed with HTTP {status}"))),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn classifies_statuses() {
    assert_eq!(classify(200), Outcome::Done);
    assert_eq!(classify(204), Outcome::Done);
    assert_eq!(classify(400), Outcome::Discard);
    assert_eq!(classify(422), Outcome::Discard);
    assert_eq!(classify(401), Outcome::Retry);
    assert_eq!(classify(500), Outcome::Retry);
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
