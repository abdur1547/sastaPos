import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { BaseApiService } from '../http/base-api.service';
import {
  AuthResponse,
  LoginRequest,
  MessageResponse,
  PasswordResetCompleteRequest,
  PasswordResetRequest,
  SignupRequest,
} from './auth.model';

/** HTTP-only access to `/api/auth/*`; holds no state. */
@Injectable({ providedIn: 'root' })
export class AuthApiService extends BaseApiService {
  login(request: LoginRequest): Observable<AuthResponse> {
    return this.post<AuthResponse, LoginRequest>('/api/auth/login', request);
  }

  signup(request: SignupRequest): Observable<AuthResponse> {
    return this.post<AuthResponse, SignupRequest>('/api/auth/signup', request);
  }

  logout(): Observable<void> {
    return this.post<void>('/api/auth/logout');
  }

  requestPasswordReset(request: PasswordResetRequest): Observable<MessageResponse> {
    return this.post<MessageResponse, PasswordResetRequest>('/api/auth/password-reset/request', request);
  }

  completePasswordReset(request: PasswordResetCompleteRequest): Observable<void> {
    return this.post<void, PasswordResetCompleteRequest>('/api/auth/password-reset/complete', request);
  }
}
