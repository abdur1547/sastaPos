import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthApiService } from './auth-api.service';
import { AuthSessionGateway } from './auth-session.gateway';
import { AuthSession, AuthResponse } from './auth.model';
import { AuthService } from './auth.service';

const user = { id: '1', name: 'Ann', email: 'a@b.c', role: 'CASHIER', status: 'ACTIVE', storeId: 's' } as const;
const session: AuthSession = { user, expiresAt: Date.now() + 60_000 };
const response: AuthResponse = { accessToken: 't', tokenType: 'Bearer', expiresIn: 604800, user };

describe('AuthService', () => {
  const gateway = { save: jest.fn(), restore: jest.fn(), getAccessToken: jest.fn(), clear: jest.fn() };
  const api = { login: jest.fn(), signup: jest.fn(), logout: jest.fn() };
  const router = { navigate: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();
    gateway.clear.mockResolvedValue(undefined);
    router.navigate.mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthSessionGateway, useValue: gateway },
        { provide: AuthApiService, useValue: api },
        { provide: Router, useValue: router },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  it('restores a valid session offline', async () => {
    gateway.restore.mockResolvedValue({ state: 'valid', session });
    await service.restoreSession();
    expect(service.isAuthenticated()).toBe(true);
  });

  it('flags an expired stored session', async () => {
    gateway.restore.mockResolvedValue({ state: 'expired' });
    await service.restoreSession();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.notice()).toBe('expired');
  });

  it('stores the session through Rust after login', async () => {
    api.login.mockReturnValue(of(response));
    gateway.save.mockResolvedValue(session);
    await service.login({ email: 'a@b.c', password: 'pw' });
    expect(gateway.save).toHaveBeenCalledWith({ accessToken: 't', expiresIn: 604800, user });
    expect(service.user()).toEqual(user);
  });

  it('logs out locally even when the API call fails', async () => {
    gateway.restore.mockResolvedValue({ state: 'valid', session });
    await service.restoreSession();
    api.logout.mockReturnValue(throwError(() => new Error('offline')));
    await service.logout();
    expect(gateway.clear).toHaveBeenCalled();
    expect(service.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
  });
});
