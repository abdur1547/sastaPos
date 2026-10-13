import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';

import { authGuard, guestGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authentication guards', () => {
  const auth = { session: jest.fn(), expireSession: jest.fn() };
  const router = { createUrlTree: jest.fn() };
  const route = new ActivatedRouteSnapshot();
  const state = { url: '/' } as RouterStateSnapshot;
  const redirect = new UrlTree();

  beforeEach(() => {
    jest.resetAllMocks();
    auth.expireSession.mockResolvedValue(undefined);
    router.createUrlTree.mockReturnValue(redirect);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('allows a valid restored session into the workspace', () => {
    auth.session.mockReturnValue({ expiresAt: Date.now() + 60_000 });
    expect(TestBed.runInInjectionContext(() => authGuard(route, state))).toBe(true);
    expect(auth.expireSession).not.toHaveBeenCalled();
  });

  it('redirects a valid restored session from authentication pages to Sell', () => {
    auth.session.mockReturnValue({ expiresAt: Date.now() + 60_000 });
    expect(TestBed.runInInjectionContext(() => guestGuard(route, state))).toBe(redirect);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/sell']);
  });

  it.each([null, { expiresAt: 0 }, { expiresAt: Date.now() }])(
    'keeps missing or expired sessions on authentication pages: %p',
    (session) => {
      auth.session.mockReturnValue(session);
      expect(TestBed.runInInjectionContext(() => guestGuard(route, state))).toBe(true);
      expect(router.createUrlTree).not.toHaveBeenCalled();
    },
  );

  it.each([null, { expiresAt: 0 }])('protects the workspace from invalid sessions: %p', (session) => {
    auth.session.mockReturnValue(session);
    expect(TestBed.runInInjectionContext(() => authGuard(route, state))).toBe(redirect);
    expect(auth.expireSession).toHaveBeenCalledTimes(1);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/auth/login']);
  });
});
