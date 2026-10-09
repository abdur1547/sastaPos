import { Routes } from '@angular/router';

import { guestGuard } from '../../core/auth/auth.guard';

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        title: 'Sign in | Counter',
        loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
      },
      {
        path: 'signup',
        title: 'Create account | Counter',
        loadComponent: () => import('./pages/signup/signup.page').then((m) => m.SignupPage),
      },
      {
        path: 'reset-password',
        title: 'Reset password | Counter',
        loadComponent: () =>
          import('./pages/reset-password/reset-password.page').then((m) => m.ResetPasswordPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'login' },
    ],
  },
];
