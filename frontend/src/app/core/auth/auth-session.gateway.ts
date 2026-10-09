import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

import { AuthSession, RestoredSession, SaveSessionInput } from './auth.model';

/** Typed wrapper over the Rust commands that own the OS credential store. */
@Injectable({ providedIn: 'root' })
export class AuthSessionGateway {
  save(input: SaveSessionInput): Promise<AuthSession> {
    return invoke<AuthSession>('auth_save_session', { input });
  }

  restore(): Promise<RestoredSession> {
    return invoke<RestoredSession>('auth_restore_session');
  }

  getAccessToken(): Promise<string | null> {
    return invoke<string | null>('auth_get_access_token');
  }

  clear(): Promise<void> {
    return invoke<void>('auth_clear_session');
  }
}
