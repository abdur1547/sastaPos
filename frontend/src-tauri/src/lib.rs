mod auth;
#[cfg(debug_assertions)]
mod scanner;
mod upload;

use async_trait::async_trait;
use futures::TryStreamExt;
use powersync::error::PowerSyncError;
use powersync::{BackendConnector, PowerSyncCredentials, PowerSyncDatabase, SyncOptions};
use tauri_plugin_powersync::PowerSyncExt;

const DEFAULT_POWERSYNC_ENDPOINT: &str = "http://localhost:8081";

#[derive(Debug)]
struct NotSignedIn;

impl std::fmt::Display for NotSignedIn {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "no valid session; sign in to start syncing")
  }
}

impl std::error::Error for NotSignedIn {}

fn powersync_endpoint_from_env() -> String {
  std::env::var("POWERSYNC_ENDPOINT")
    .ok()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
    .unwrap_or_else(|| DEFAULT_POWERSYNC_ENDPOINT.to_string())
}

struct AppBackendConnector {
  db: PowerSyncDatabase,
  endpoint: String,
  http: reqwest::Client,
  api_base_url: String,
}

#[async_trait]
impl BackendConnector for AppBackendConnector {
  // The backend-issued JWT (same one used for the REST API) is also the PowerSync token.
  // Before login this fails and the SDK retries, so sync starts once the user signs in.
  async fn fetch_credentials(&self) -> Result<PowerSyncCredentials, PowerSyncError> {
    let token = auth::current_access_token().ok_or_else(|| PowerSyncError::upload_error(NotSignedIn))?;
    Ok(PowerSyncCredentials {
      endpoint: self.endpoint.clone(),
      token,
    })
  }

  // Queued local writes go to the backend's single upload endpoint, many transactions per request.
  // Completing the last transaction of a batch also completes every earlier one.
  async fn upload_data(&self) -> Result<(), PowerSyncError> {
    loop {
      let mut operations: Vec<upload::Operation> = Vec::new();
      let mut last_tx = None;
      {
        let mut local_writes = self.db.crud_transactions();
        while let Some(tx) = local_writes.try_next().await? {
          operations.extend(tx.crud.iter().map(upload::Operation::from));
          last_tx = Some(tx);
          if operations.len() >= upload::MAX_OPERATIONS_PER_REQUEST {
            break;
          }
        }
      }
      let Some(last_tx) = last_tx else {
        return Ok(());
      };

      let token = auth::current_access_token().ok_or_else(|| PowerSyncError::upload_error(NotSignedIn))?;
      if upload::send(&self.http, &self.api_base_url, &token, &operations).await? {
        last_tx.complete().await?;
      }
    }
  }
}

// Sync state must be owned by Rust so it's shared across all windows.
#[tauri::command]
async fn connect<R: tauri::Runtime>(
  app: tauri::AppHandle<R>,
  handle: usize,
) -> tauri_plugin_powersync::Result<()> {
  let database = app.powersync().database_from_javascript_handle(handle)?;

  let options = SyncOptions::new(AppBackendConnector {
    db: database.clone(),
    endpoint: powersync_endpoint_from_env(),
    http: reqwest::Client::new(),
    api_base_url: upload::api_base_url_from_env(),
  });
  database.connect(options).await;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  dotenvy::dotenv().ok();

  let builder = tauri::Builder::default().plugin(tauri_plugin_powersync::init());

  #[cfg(debug_assertions)]
  let builder = builder
    .manage(scanner::ScannerSimulator::default())
    .on_window_event(scanner::on_window_event)
    .invoke_handler(tauri::generate_handler![
      connect,
      auth::auth_save_session,
      auth::auth_restore_session,
      auth::auth_get_access_token,
      auth::auth_clear_session,
      scanner::scanner_simulator_start,
      scanner::scanner_simulator_feed,
      scanner::scanner_simulator_stop
    ]);

  #[cfg(not(debug_assertions))]
  let builder = builder.invoke_handler(tauri::generate_handler![
    connect,
    auth::auth_save_session,
    auth::auth_restore_session,
    auth::auth_get_access_token,
    auth::auth_clear_session
  ]);

  builder
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
