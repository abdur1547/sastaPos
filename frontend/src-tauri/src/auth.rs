use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

const KEYRING_SERVICE: &str = "com.sastapos.auth";
const KEYRING_ACCOUNT: &str = "session";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
  pub id: String,
  pub name: String,
  pub email: String,
  pub role: String,
  pub status: String,
  #[serde(default)]
  pub store_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSessionInput {
  pub access_token: String,
  pub expires_in: Option<i64>,
  pub user: AuthUser,
}

/// Persisted in the OS credential store. Never returned to Angular as a whole.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
  access_token: String,
  expires_at: i64,
  user: AuthUser,
}

/// Non-secret session metadata shared with Angular.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
  pub user: AuthUser,
  pub expires_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum RestoredSession {
  None,
  Expired,
  Valid { session: SessionInfo },
}

fn now_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0)
}

/// Reads the `exp` claim (seconds) without verifying the signature; the
/// backend remains the authority, this only drives the offline session policy.
fn jwt_expiry_ms(token: &str) -> Option<i64> {
  let payload = token.split('.').nth(1)?;
  let bytes = URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
  let claims: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
  claims.get("exp")?.as_i64().map(|exp| exp * 1000)
}

fn entry() -> Result<Entry, String> {
  Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| format!("credential store unavailable: {e}"))
}

fn load() -> Result<Option<StoredSession>, String> {
  match entry()?.get_password() {
    Ok(raw) => Ok(serde_json::from_str(&raw).ok()),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(format!("failed to read credential store: {e}")),
  }
}

fn clear() -> Result<(), String> {
  match entry()?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(format!("failed to clear credential store: {e}")),
  }
}

fn resolve_expiry(input: &SaveSessionInput) -> Result<i64, String> {
  jwt_expiry_ms(&input.access_token)
    .or_else(|| input.expires_in.filter(|s| *s > 0).map(|s| now_ms() + s * 1000))
    .ok_or_else(|| "token has no usable expiration".to_string())
}

#[tauri::command]
pub async fn auth_save_session<R: tauri::Runtime>(
  app: tauri::AppHandle<R>,
  input: SaveSessionInput,
) -> Result<SessionInfo, String> {
  if input.access_token.trim().is_empty() {
    return Err("access token is empty".to_string());
  }
  let expires_at = resolve_expiry(&input)?;
  if expires_at <= now_ms() {
    return Err("access token is already expired".to_string());
  }

  let stored = StoredSession {
    access_token: input.access_token,
    expires_at,
    user: input.user,
  };
  let raw = serde_json::to_string(&stored).map_err(|e| e.to_string())?;
  entry()?
    .set_password(&raw)
    .map_err(|e| format!("failed to write credential store: {e}"))?;

  crate::reconnect_powersync(&app).await;

  Ok(SessionInfo { user: stored.user, expires_at })
}

#[tauri::command]
pub fn auth_restore_session() -> Result<RestoredSession, String> {
  match load()? {
    None => Ok(RestoredSession::None),
    Some(stored) if stored.expires_at <= now_ms() => {
      clear()?;
      Ok(RestoredSession::Expired)
    }
    Some(stored) => Ok(RestoredSession::Valid {
      session: SessionInfo { user: stored.user, expires_at: stored.expires_at },
    }),
  }
}

/// Returns the bearer token only while the session is still valid.
#[tauri::command]
pub fn auth_get_access_token() -> Result<Option<String>, String> {
  Ok(load()?
    .filter(|stored| stored.expires_at > now_ms())
    .map(|stored| stored.access_token))
}

/// Valid bearer token for Rust-side callers (e.g. the PowerSync connector).
pub fn current_access_token() -> Option<String> {
  load()
    .ok()
    .flatten()
    .filter(|stored| stored.expires_at > now_ms())
    .map(|stored| stored.access_token)
}

#[tauri::command]
pub async fn auth_clear_session<R: tauri::Runtime>(
  app: tauri::AppHandle<R>,
) -> Result<(), String> {
  clear()?;
  crate::disconnect_powersync(&app).await;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn token(exp: i64) -> String {
    let payload = URL_SAFE_NO_PAD.encode(format!("{{\"exp\":{exp}}}"));
    format!("h.{payload}.s")
  }

  #[test]
  fn reads_exp_claim_in_ms() {
    assert_eq!(jwt_expiry_ms(&token(1_000)), Some(1_000_000));
  }

  #[test]
  fn rejects_malformed_token() {
    assert_eq!(jwt_expiry_ms("not-a-jwt"), None);
  }
}
