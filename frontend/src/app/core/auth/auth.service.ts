import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiError } from '../http/api-error.model';
import { AuthApiService } from './auth-api.service';
import { AuthSessionGateway } from './auth-session.gateway';
import { AuthenticatedUser, AuthResponse, AuthSession, LoginRequest, SignupRequest } from './auth.model';

export type SessionNotice = 'expired' | null;

const MAX_TIMER_MS = 2_147_483_647;

/**
 * Owns authentication state. Tokens live only in the Rust credential store;
 * Angular keeps the non-secret session metadata in a signal.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthApiService);
  private readonly gateway = inject(AuthSessionGateway);
  private readonly router = inject(Router);

  private readonly sessionState = signal<AuthSession | null>(null);
  private readonly noticeState = signal<SessionNotice>(null);
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  readonly session = this.sessionState.asReadonly();
  readonly user = computed(() => this.sessionState()?.user ?? null);
  readonly isAuthenticated = computed(() => this.sessionState() !== null);
  readonly notice = this.noticeState.asReadonly();

  /** Restores a locally stored session on startup; works fully offline. */
  async restoreSession(): Promise<void> {
    try {
      const restored = await this.gateway.restore();
      if (restored.state === 'valid') {
        this.setSession(restored.session);
      } else if (restored.state === 'expired') {
        this.noticeState.set('expired');
      }
    } catch (error) {
      console.error('[Auth] failed to restore session', error);
    }
  }

  async login(request: LoginRequest): Promise<void> {
    await this.establishSession(await firstValueFrom(this.api.login(request)));
  }

  async signup(request: SignupRequest): Promise<void> {
    await this.establishSession(await firstValueFrom(this.api.signup(request)));
  }

  /** Clears credentials only; local sales and the sync database are untouched. */
  async logout(): Promise<void> {
    if (this.isAuthenticated()) {
      // Best effort: the server only needs to know, offline logout must still work.
      await firstValueFrom(this.api.logout()).catch(() => undefined);
    }
    await this.endSession(null);
  }

  /** Called when the JWT expires locally or the server rejects it. */
  async expireSession(): Promise<void> {
    if (this.isAuthenticated()) {
      await this.endSession('expired');
    }
  }

  clearNotice(): void {
    this.noticeState.set(null);
  }

  async refreshUser(): Promise<void> {
    await this.updateUser(await firstValueFrom(this.api.getCurrentUser()));
  }

  async updateUser(user: AuthenticatedUser): Promise<void> {
    const session = this.session();
    const accessToken = await this.gateway.getAccessToken();
    if (!session || !accessToken || session.expiresAt <= Date.now()) {
      throw new Error('Your session expired. Sign in again to continue setup.');
    }
    try {
      const updated = await this.gateway.save({
        accessToken,
        expiresIn: Math.floor((session.expiresAt - Date.now()) / 1000),
        user,
      });
      this.setSession(updated);
    } catch (error) {
      console.error('[Auth] failed to update stored user', error);
      throw new ApiError('unknown', 0, 'Your store is saved, but the updated session could not be stored securely. Retry to continue.');
    }
  }

  private async establishSession(response: AuthResponse): Promise<void> {
    try {
      const session = await this.gateway.save({
        accessToken: response.accessToken,
        expiresIn: response.expiresIn,
        user: response.user,
      });
      this.noticeState.set(null);
      this.setSession(session);
    } catch (error) {
      console.error('[Auth] failed to store session', error);
      throw new ApiError('unknown', 0, 'Signed in, but the session could not be stored securely on this device.');
    }
  }

  private async endSession(notice: SessionNotice): Promise<void> {
    this.clearTimer();
    this.sessionState.set(null);
    this.noticeState.set(notice);
    await this.gateway.clear().catch((error: unknown) => console.error('[Auth] failed to clear session', error));
    await this.router.navigate(['/auth/login']);
  }

  private setSession(session: AuthSession): void {
    this.clearTimer();
    this.sessionState.set(session);
    const remaining = session.expiresAt - Date.now();
    this.expiryTimer = setTimeout(() => void this.expireSession(), Math.min(Math.max(remaining, 0), MAX_TIMER_MS));
  }

  private clearTimer(): void {
    if (this.expiryTimer !== null) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }
}
