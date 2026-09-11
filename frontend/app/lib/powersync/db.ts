import { PowerSyncTauriDatabase } from '@powersync/tauri-plugin';
import { appDataDir } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';

import { AppSchema } from './AppSchema';

// A single PowerSyncTauriDatabase instance per SQLite file. The actual SQLite database and the
// sync client live in Rust (see src-tauri/src/lib.rs and src-tauri/src/connector.rs); this object
// is a thin JS handle that talks to Rust over Tauri's IPC.
export const db = new PowerSyncTauriDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'powersync.db',
    // Store the database in the app data directory rather than next to the executable.
    dbLocationAsync: appDataDir
  }
});

let connected = false;

/**
 * Opens the local SQLite database and connects it to the self-hosted PowerSync service.
 * Connecting is driven entirely by Rust (see the `connect` Tauri command) so sync state is
 * shared across every window of the app.
 */
export async function connectPowerSync(): Promise<void> {
  if (connected) return;

  await db.init();
  await invoke<void>('connect', { handle: db.rustHandle });
  connected = true;
}
