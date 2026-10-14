import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';

jest.mock('./features/sell/sell.page', () => ({ SellPage: jest.fn() }));

@Component({ template: '' })
class RouteTestPage {}

describe('startup routing', () => {
  it.each([true, false])('opens the correct default page when authenticated is %p', async (signedIn) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          routes.map((route) => {
            if (route.path === 'auth') {
              return { path: 'auth/login', component: RouteTestPage };
            }
            if (route.children) {
              return {
                ...route,
                children: route.children.map((child) =>
                  child.path === 'sell' ? { ...child, component: RouteTestPage } : child,
                ),
              };
            }
            return route;
          }),
        ),
        {
          provide: AuthService,
          useValue: {
            session: () => (signedIn ? { expiresAt: Date.now() + 60_000 } : null),
            user: () => (signedIn ? { role: 'CASHIER', storeId: 'store' } : null),
            expireSession: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });

    await RouterTestingHarness.create('/');

    expect(TestBed.inject(Router).url).toBe(signedIn ? '/sell' : '/auth/login');
  });
});
