import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { CustomersPage } from './features/customers/customers.page';
import { ProductsPage } from './features/products/products.page';
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
      { path: 'customers', component: CustomersPage, title: 'Customers | Counter' },
      { path: 'products', component: ProductsPage, title: 'Products | Counter' },
      { path: '', pathMatch: 'full', redirectTo: 'sell' },
    ],
  },
  { path: '**', redirectTo: 'sell' },
];
