import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { SellPage } from './features/sell/sell.page';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: 'sell', component: SellPage, title: 'Sell | Counter' },
      {
        path: 'customers',
        loadChildren: () => import('./features/customers/customers.routes').then((m) => m.CUSTOMER_ROUTES),
      },
      {
        path: 'products',
        loadChildren: () => import('./features/products/products.routes').then((m) => m.PRODUCT_ROUTES),
      },
      { path: '', pathMatch: 'full', redirectTo: 'sell' },
    ],
  },
  { path: '**', redirectTo: 'sell' },
];
