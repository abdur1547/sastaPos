import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthSessionGateway } from './auth-session.gateway';
import { AuthService } from './auth.service';

const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/signup', '/api/auth/password-reset/'];

function isProtectedApiCall(url: string): boolean {
  return url.startsWith(environment.apiBaseUrl) && !PUBLIC_PATHS.some((path) => url.includes(path));
}

/** Adds the bearer token (read from the Rust credential store) to protected API calls. */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isProtectedApiCall(req.url)) {
    return next(req);
  }

  const gateway = inject(AuthSessionGateway);
  const auth = inject(AuthService);

  return from(gateway.getAccessToken()).pipe(
    switchMap((token) =>
      next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req),
    ),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        void auth.expireSession();
      }
      return throwError(() => error);
    }),
  );
};
