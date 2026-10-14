import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { provideRouter, Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { of, throwError } from "rxjs";

import { routes } from "../../app.routes";
import { AuthApiService } from "../../core/auth/auth-api.service";
import { AuthSessionGateway } from "../../core/auth/auth-session.gateway";
import {
  AuthenticatedUser,
  SaveSessionInput,
} from "../../core/auth/auth.model";
import { AuthService } from "../../core/auth/auth.service";
import { ApiError } from "../../core/http/api-error.model";
import { OnlineService } from "../../core/network/online.service";
import { OnboardingProgressService } from "../../core/onboarding/onboarding-progress.service";
import { SignupPage } from "../auth/pages/signup/signup.page";
import { StoreApiService } from "../store/store-api.service";
import { Store } from "../store/store.model";
import { OnboardingApiService } from "./onboarding-api.service";
import { OnboardingPage } from "./onboarding.page";

jest.mock("../sell/sell.page", () => ({ SellPage: jest.fn() }));

@Component({ template: "Sell workspace" })
class SellRouteTestPage {
  static activations = 0;
  constructor() {
    SellRouteTestPage.activations++;
  }
}

const SIGNUP_USER: AuthenticatedUser = {
  id: "signup-user",
  name: "New user",
  email: "new@example.com",
  role: "CASHIER",
  status: "ACTIVE",
  storeId: null,
};
const STORE: Store = {
  id: "store",
  name: "Store",
  ntn: "123",
  address: null,
  currencyCode: "PKR",
  timezone: "Asia/Karachi",
  status: "ACTIVE",
  storeSettings: {
    id: "settings",
    invoicePrefix: "INV-",
    invoiceNumberStart: 1,
    nextInvoiceNumber: 1,
    receiptFooter: "Thank you",
  },
};
const OWNER: AuthenticatedUser = {
  ...SIGNUP_USER,
  role: "OWNER",
  storeId: STORE.id,
};

describe("signup-to-store onboarding routing", () => {
  const authApi = { signup: jest.fn(), getCurrentUser: jest.fn() };
  const gateway = { save: jest.fn(), getAccessToken: jest.fn() };
  const storeApi = { getStore: jest.fn(), createStore: jest.fn() };
  const expiresAt = Date.now() + 600_000;

  beforeEach(() => {
    localStorage.clear();
    jest.resetAllMocks();
    SellRouteTestPage.activations = 0;
    authApi.signup.mockReturnValue(
      of({
        accessToken: "token",
        expiresIn: 600,
        tokenType: "Bearer",
        user: SIGNUP_USER,
      }),
    );
    authApi.getCurrentUser.mockReturnValue(of(OWNER));
    gateway.getAccessToken.mockResolvedValue("token");
    gateway.save.mockImplementation(async (input: SaveSessionInput) => ({
      user: input.user,
      expiresAt,
    }));
    storeApi.getStore.mockReturnValue(
      throwError(() => new ApiError("unknown", 404, "No store")),
    );
    storeApi.createStore.mockReturnValue(of({ store: STORE, user: OWNER }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          routes.map((route) =>
            route.children
              ? {
                  ...route,
                  children: route.children.map((child) =>
                    child.path === "sell"
                      ? { ...child, component: SellRouteTestPage }
                      : child,
                  ),
                }
              : route,
          ),
        ),
        { provide: AuthApiService, useValue: authApi },
        { provide: AuthSessionGateway, useValue: gateway },
        { provide: StoreApiService, useValue: storeApi },
        { provide: OnboardingApiService, useValue: {} },
        { provide: MatSnackBar, useValue: { open: jest.fn() } },
        {
          provide: OnlineService,
          useValue: { online: () => true, requireOnline: jest.fn() },
        },
      ],
    });
  });

  function fill(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event("input"));
  }

  async function settle(harness: RouterTestingHarness): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
    // Routed initialization starts further promise work after navigation settles.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  it("keeps the real signup CASHIER in onboarding, shows settings after store creation, and never activates Sell", async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl("/auth/signup", SignupPage);
    const inputs =
      harness.routeNativeElement!.querySelectorAll<HTMLInputElement>("input");
    ["New user", "new@example.com", "password123", "password123"].forEach(
      (value, index) => fill(inputs[index], value),
    );
    harness
      .routeNativeElement!.querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle(harness);

    const router = TestBed.inject(Router);
    expect(router.url).toBe("/onboarding");
    expect(harness.routeDebugElement!.componentInstance).toBeInstanceOf(
      OnboardingPage,
    );
    expect(harness.routeNativeElement!.textContent).toContain("Step 1 of 5");
    expect(TestBed.inject(AuthService).user()?.role).toBe("CASHIER");
    expect(SellRouteTestPage.activations).toBe(0);
    expect(
      harness.routeNativeElement!.querySelector('[aria-busy="true"]'),
    ).toBeNull();

    storeApi.getStore.mockReturnValue(of(STORE));
    // The first check still finds no store; the newly created store is loaded by settings.
    storeApi.getStore.mockReturnValueOnce(
      throwError(() => new ApiError("unknown", 404, "No store")),
    );
    fill(
      harness.routeNativeElement!.querySelector<HTMLInputElement>(
        'app-form-field[label="Store name"] input',
      )!,
      "Store",
    );
    fill(
      harness.routeNativeElement!.querySelector<HTMLInputElement>(
        'app-form-field[label="National tax number (NTN)"] input',
      )!,
      "123",
    );
    harness.detectChanges();
    expect(
      harness
        .routeNativeElement!.querySelector("form")!
        .classList.contains("ng-invalid"),
    ).toBe(false);
    harness
      .routeNativeElement!.querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle(harness);

    expect(storeApi.createStore).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(AuthService).user()).toEqual(OWNER);
    expect(TestBed.inject(OnboardingProgressService).step()).toBe(1);
    expect(router.url).toBe("/onboarding");
    expect(harness.routeNativeElement!.textContent).toContain("Step 2 of 5");
    expect(
      harness.routeNativeElement!.querySelector("app-store-settings-page"),
    ).not.toBeNull();
    expect(SellRouteTestPage.activations).toBe(0);

    await harness.navigateByUrl("/sell");
    expect(router.url).toBe("/onboarding");
    expect(SellRouteTestPage.activations).toBe(0);
  });

  it("redirects a storeless CASHIER entering the default workspace back to setup", async () => {
    await TestBed.inject(AuthService).signup({
      name: "New user",
      email: "new@example.com",
      password: "password123",
    });
    const harness = await RouterTestingHarness.create("/");
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe("/onboarding");
    expect(SellRouteTestPage.activations).toBe(0);
  });
});
