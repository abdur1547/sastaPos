mod connector;

use connector::AppBackendConnector;
use powersync::SyncOptions;
use tauri::{AppHandle, Runtime};
use tauri_plugin_powersync::PowerSyncExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Loads POWERSYNC_URL / POWERSYNC_TOKEN / BACKEND_API_URL from src-tauri/.env in development.
  let _ = dotenvy::dotenv();

  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![connect])
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
    .plugin(tauri_plugin_powersync::init())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

/// Connects a PowerSync database opened from JavaScript (`PowerSyncTauriDatabase`) to the
/// self-hosted PowerSync service. Sync must be driven from Rust so state is shared across windows.
#[tauri::command]
async fn connect<R: Runtime>(
  app: AppHandle<R>,
  handle: usize,
) -> tauri_plugin_powersync::Result<()> {
  let database = app.powersync().database_from_javascript_handle(handle)?;
  let connector = AppBackendConnector::new(database.clone());
  database.connect(SyncOptions::new(connector)).await;
  Ok(())
}
