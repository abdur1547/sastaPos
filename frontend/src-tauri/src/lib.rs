mod auth;

use async_trait::async_trait;
use futures::TryStreamExt;
use powersync::error::PowerSyncError;
use powersync::{BackendConnector, PowerSyncCredentials, PowerSyncDatabase, SyncOptions};
use tauri_plugin_powersync::PowerSyncExt;

fn powersync_config_from_env() -> Result<(String, String), String> {
  let endpoint = std::env::var("POWERSYNC_ENDPOINT")
    .map_err(|_| "POWERSYNC_ENDPOINT is not set".to_string())?;
  let endpoint = endpoint.trim();
  if endpoint.is_empty() {
    return Err("POWERSYNC_ENDPOINT is empty".to_string());
  }

  let token = std::env::var("POWERSYNC_DEV_TOKEN")
    .map_err(|_| "POWERSYNC_DEV_TOKEN is not set".to_string())?;
  let token = token.trim();
  if token.is_empty() {
    return Err("POWERSYNC_DEV_TOKEN is empty".to_string());
  }

  Ok((endpoint.to_string(), token.to_string()))
}

struct AppBackendConnector {
  db: PowerSyncDatabase,
  endpoint: String,
  token: String,
}

#[async_trait]
impl BackendConnector for AppBackendConnector {
  async fn fetch_credentials(&self) -> Result<PowerSyncCredentials, PowerSyncError> {
    Ok(PowerSyncCredentials {
      endpoint: self.endpoint.clone(),
      token: self.token.clone(),
    })
  }

  async fn upload_data(&self) -> Result<(), PowerSyncError> {
    // TODO: no backend write API exists yet, so queued mutations are dropped here.
    let mut local_writes = self.db.crud_transactions();
    while let Some(tx) = local_writes.try_next().await? {
      tx.complete().await?;
    }
    Ok(())
  }
}

// Sync state must be owned by Rust so it's shared across all windows.
#[tauri::command]
async fn connect<R: tauri::Runtime>(
  app: tauri::AppHandle<R>,
  handle: usize,
) -> tauri_plugin_powersync::Result<()> {
  let database = app.powersync().database_from_javascript_handle(handle)?;

  // Release builds do not normally include a local .env file, so the app should
  // keep running in offline mode instead of crashing during startup.
  let config = match powersync_config_from_env() {
    Ok(config) => config,
    Err(error) => {
      eprintln!("[PowerSync] skipping sync initialization: {error}");
      return Ok(());
    }
  };

  let (endpoint, token) = config;
  let options = SyncOptions::new(AppBackendConnector { db: database.clone(), endpoint, token });
  database.connect(options).await;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::powersync_config_from_env;

  #[test]
  fn powersync_config_requires_endpoint_and_token() {
    let original_endpoint = std::env::var("POWERSYNC_ENDPOINT").ok();
    let original_token = std::env::var("POWERSYNC_DEV_TOKEN").ok();

    std::env::remove_var("POWERSYNC_ENDPOINT");
    std::env::remove_var("POWERSYNC_DEV_TOKEN");

    let missing = powersync_config_from_env();
    assert!(missing.is_err());

    if let Some(value) = original_endpoint {
      std::env::set_var("POWERSYNC_ENDPOINT", value);
    }
    if let Some(value) = original_token {
      std::env::set_var("POWERSYNC_DEV_TOKEN", value);
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  dotenvy::dotenv().ok();

  tauri::Builder::default()
    .plugin(tauri_plugin_powersync::init())
    .invoke_handler(tauri::generate_handler![
      connect,
      auth::auth_save_session,
      auth::auth_restore_session,
      auth::auth_get_access_token,
      auth::auth_clear_session
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
