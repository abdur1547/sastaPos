import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import { PowerSyncTauriDatabase } from '@powersync/tauri-plugin';
import { AppSchema } from './app-schema';

/**
 * Owns the single client-side PowerSync SQLite database instance for the app.
 * Call connect() once during app startup before using query methods.
 */
@Injectable({ providedIn: 'root' })
export class PowerSyncService {
  readonly db = new PowerSyncTauriDatabase({
    schema: AppSchema,
    database: {
      dbFilename: 'powersync.db', 
      // Store the database in the app data directory
      dbLocationAsync: appDataDir,
    },
  });

  private connected = false;

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    this.connected = true;

    // For Tauri, sync must be driven from Rust so state is shared across
    // all windows; calling db.connect() from JS throws. The `connect`
    // Tauri command (src-tauri/src/lib.rs) owns the BackendConnector.
    await this.db.init();
    await invoke('connect', { handle: this.db.rustHandle });

    // Log sync status transitions to the devtools console for diagnostics.
    this.db.registerListener({
      statusChanged: (status) => {
        console.log('[PowerSync] status', {
          connected: status.connected,
          connecting: status.connecting,
          dataFlow: status.dataFlowStatus,
          lastSyncedAt: status.lastSyncedAt,
        });
      },
    });
  }

  async reconnect(): Promise<void> {
    await invoke('powersync_reconnect');
  }

  async disconnect(): Promise<void> {
    await invoke('powersync_disconnect');
  }
}
