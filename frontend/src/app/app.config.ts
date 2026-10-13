import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authTokenInterceptor } from './core/auth/auth-token.interceptor';
import { LocalDbSeeder } from './core/dev/local-db-seeder';
import { PowerSyncService } from './core/powersync/powersync.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withFetch(), withInterceptors([authTokenInterceptor])),
    provideAppInitializer(() => inject(AuthService).restoreSession()),
    provideAppInitializer(() => inject(PowerSyncService).connect()),
    provideAppInitializer(() => {
      if (environment.production) {
        return;
      }
      // Temporary: run `await seedLocalDb()` / `await clearLocalSeed()` in the devtools console.
      const seeder = inject(LocalDbSeeder);
      Object.assign(globalThis, {
        seedLocalDb: () => seeder.seed(),
        clearLocalSeed: () => seeder.clear(),
      });
    }),
  ],
};
