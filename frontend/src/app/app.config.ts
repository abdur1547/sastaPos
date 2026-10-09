import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authTokenInterceptor } from './core/auth/auth-token.interceptor';
import { GlobalErrorHandler } from './core/error/global-error-handler';
import { PowerSyncService } from './core/powersync/powersync.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withFetch(), withInterceptors([authTokenInterceptor])),
    // { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideAppInitializer(() => inject(AuthService).restoreSession()),
    provideAppInitializer(() => inject(PowerSyncService).connect()),
  ],
};
