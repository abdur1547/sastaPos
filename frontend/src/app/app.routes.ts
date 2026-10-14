import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { onboardingAccessGuard, setupRequiredGuard } from './core/onboarding/onboarding.guard';
import { SellPage } from './features/sell/sell.page';
import { HARDWARE_ROUTES } from './features/hardware/hardware.routes';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [setupRequiredGuard],
    children: [
      {
        path: 'onboarding',
        canActivate: [onboardingAccessGuard],
        loadComponent: () => import('./features/onboarding/onboarding.page').then((m) => m.OnboardingPage),
        canDeactivate: [(page: { canLeave(): boolean | Promise<boolean> }) => page.canLeave()],
        title: 'Store setup | Counter',
      },
      { path: '', pathMatch: 'full', redirectTo: 'sell' },
      { path: 'sell', component: SellPage, title: 'Sell | Counter' },
      {
        path: 'receipts',
        title: 'Receipts | Counter',
        loadComponent: () => import('./features/hardware/receipt-jobs.page').then((m) => m.ReceiptJobsPage),
      },
      ...HARDWARE_ROUTES,
      {
        path: 'sales',
        loadChildren: () => import('./features/sales/sales.routes').then((m) => m.SALE_ROUTES),
      },
      {
        path: 'customers',
        loadChildren: () => import('./features/customers/customers.routes').then((m) => m.CUSTOMER_ROUTES),
      },
      {
        path: 'products',
        loadChildren: () => import('./features/products/products.routes').then((m) => m.PRODUCT_ROUTES),
      },
      {
        path: 'users',
        loadChildren: () => import('./features/users/users.routes').then((m) => m.USER_ROUTES),
      },
      {
        path: 'store-settings',
        loadChildren: () => import('./features/store/store.routes').then((m) => m.STORE_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: 'sell' },
];
