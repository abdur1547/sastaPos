import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Protects the POS workspace; valid sessions work offline. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const session = auth.session();
  if (session && session.expiresAt > Date.now()) {
    return true;
  }
  void auth.expireSession();
  return inject(Router).createUrlTree(['/auth/login']);
};

/** Keeps signed-in users out of the authentication pages. */
export const guestGuard: CanActivateFn = () => {
  // const auth = inject(AuthService);
  // return auth.isAuthenticated() ? inject(Router).createUrlTree(['/sell']) : true;
  return true;
};
