import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { provideRouter, Router } from "@angular/router";
import { of, throwError } from "rxjs";

import { AuthenticatedUser } from "../../core/auth/auth.model";
import { AuthService } from "../../core/auth/auth.service";
import { ApiError } from "../../core/http/api-error.model";
import { OnlineService } from "../../core/network/online.service";
import { OnboardingProgressService } from "../../core/onboarding/onboarding-progress.service";
import { StoreApiService } from "../store/store-api.service";
import { Store } from "../store/store.model";
import { UserRepository } from "../users/user.repository";
import { OnboardingApiService } from "./onboarding-api.service";
import { OnboardingPage } from "./onboarding.page";

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
    invoicePrefix: null,
    receiptFooter: null,
    invoiceNumberStart: 1,
    nextInvoiceNumber: 1,
  },
};
const OWNER: AuthenticatedUser = {
  id: "owner",
  name: "Owner",
  email: "owner@example.com",
  role: "OWNER",
  status: "ACTIVE",
  storeId: null,
};

class TestOnboardingPage extends OnboardingPage {
  readonly currentStep = this.step;
  readonly profile = this.storeForm;
  readonly failure = this.error;
  readonly loadFailure = this.loadError;
  readonly staff = this.users;
  readonly customerRows = this.customers;
  reload = () => this.load();
  saveStore = () => this.createStore();
  advance = () => this.next();
  saveStaff = () =>
    this.createStaff({
      name: "Cashier",
      email: "cashier@example.com",
      password: "password123",
    });
  saveCustomer = () =>
    this.createCustomer({
      name: "Customer",
      phoneNumber: "",
      ntn: "",
      status: "ACTIVE",
    });
}

describe("OnboardingPage", () => {
  const user = signal<AuthenticatedUser>(OWNER);
  const online = signal(true);
  const auth = { user, isAuthenticated: () => true, updateUser: jest.fn(), refreshUser: jest.fn() };
  const storeApi = {
    getStore: jest.fn(),
    createStore: jest.fn(),
    updateSettings: jest.fn(),
  };
  const api = {
    customers: jest.fn(),
    products: jest.fn(),
    units: jest.fn(),
    createCustomer: jest.fn(),
    createProduct: jest.fn(),
  };
  const staff = { list: jest.fn(), create: jest.fn() };
  const progress = { step: jest.fn(), save: jest.fn() };
  let page: TestOnboardingPage;

  beforeEach(() => {
    jest.resetAllMocks();
    user.set(OWNER);
    online.set(true);
    storeApi.getStore.mockReturnValue(
      throwError(() => new ApiError("unknown", 404, "No store")),
    );
    storeApi.createStore.mockReturnValue(
      of({ store: STORE, user: { ...OWNER, storeId: STORE.id } }),
    );
    auth.updateUser.mockImplementation(async (updated: AuthenticatedUser) => {
      user.set(updated);
    });
    auth.refreshUser.mockImplementation(async () => {
      user.set({ ...OWNER, storeId: STORE.id });
    });
    progress.step.mockReturnValue(0);
    api.customers.mockResolvedValue([]);
    api.products.mockResolvedValue([]);
    api.units.mockResolvedValue([{ id: "unit", name: "Each", code: "EA" }]);
    staff.list.mockResolvedValue([]);
    staff.create.mockResolvedValue("staff-id");
    TestBed.configureTestingModule({
      imports: [OnboardingPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: StoreApiService, useValue: storeApi },
        { provide: OnboardingApiService, useValue: api },
        { provide: UserRepository, useValue: staff },
        { provide: OnboardingProgressService, useValue: progress },
        { provide: MatSnackBar, useValue: { open: jest.fn() } },
        {
          provide: OnlineService,
          useValue: {
            online,
            requireOnline: () => {
              if (!online()) throw new Error("offline");
            },
          },
        },
      ],
    });
    jest.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    page = TestBed.runInInjectionContext(() => new TestOnboardingPage());
    page.profile.setValue({
      name: "Store",
      ntn: "123",
      address: "",
      currencyCode: "PKR",
      timezone: "Asia/Karachi",
    });
  });

  it("renders five accessible steps, optional labels and prefilled regional defaults", async () => {
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(
      root.querySelectorAll('ol[aria-label="Store setup progress"] > li'),
    ).toHaveLength(5);
    expect(root.querySelector('[aria-current="step"]')?.textContent).toContain(
      "Create store",
    );
    expect(root.textContent).toContain("Step 1 of 5");
    expect(root.textContent).toContain("Online only");
    expect(root.querySelectorAll("ol .text-xs")).toHaveLength(3);
    const inputs = Array.from(root.querySelectorAll("input"));
    expect(inputs.some((input) => input.value === "PKR")).toBe(true);
    expect(inputs.some((input) => input.value === "Asia/Karachi")).toBe(true);
  });

  it("creates the store directly and persists the associated session before settings", async () => {
    await page.saveStore();
    expect(storeApi.createStore).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledWith({
      ...OWNER,
      storeId: STORE.id,
    });
    expect(page.currentStep()).toBe(1);
    expect(progress.save).toHaveBeenCalledWith(1);
  });

  it("does not recreate a store after secure session persistence fails", async () => {
    auth.updateUser.mockRejectedValueOnce(
      new Error("Credential storage failed"),
    );
    await page.saveStore();
    expect(page.failure()).toContain("Credential storage failed");
    expect(page.currentStep()).toBe(0);
    await page.saveStore();
    expect(storeApi.createStore).toHaveBeenCalledTimes(1);
    expect(page.currentStep()).toBe(1);
  });

  it("recovers an already-created server store after a lost POST response", async () => {
    storeApi.createStore.mockReturnValue(
      throwError(() => new Error("Response lost")),
    );
    await page.saveStore();
    storeApi.getStore.mockReturnValue(of(STORE));
    await page.saveStore();
    expect(storeApi.createStore).toHaveBeenCalledTimes(1);
    expect(page.currentStep()).toBe(1);
  });

  it("recovers a store on reload without another POST", async () => {
    user.set({ ...OWNER, role: "CASHIER" });
    storeApi.getStore.mockReturnValue(of(STORE));
    await page.reload();
    expect(storeApi.createStore).not.toHaveBeenCalled();
    expect(page.currentStep()).toBe(1);
    expect(auth.refreshUser).toHaveBeenCalledTimes(1);
    expect(user()).toEqual({ ...OWNER, storeId: STORE.id });
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });

  it("surfaces load errors rather than assuming there is no store", async () => {
    storeApi.getStore.mockReturnValue(
      throwError(() => new Error("Server unavailable")),
    );
    await page.reload();
    expect(page.loadFailure()).toBe("Server unavailable");
    expect(storeApi.createStore).not.toHaveBeenCalled();
  });

  it("retains setup and retries server user recovery if interrupted promotion cannot be refreshed", async () => {
    user.set({ ...OWNER, role: "CASHIER" });
    storeApi.getStore.mockReturnValue(of(STORE));
    auth.refreshUser.mockRejectedValueOnce(new Error("Could not refresh the session"));
    await page.reload();
    expect(page.loadFailure()).toBe("Could not refresh the session");
    expect(page.currentStep()).toBe(0);
    await page.reload();
    expect(page.currentStep()).toBe(1);
    expect(user()).toEqual({ ...OWNER, storeId: STORE.id });
    expect(storeApi.createStore).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });

  it("skips every optional step without creating records, then finishes", async () => {
    page.currentStep.set(2);
    await page.advance();
    await page.advance();
    await page.advance();
    expect(progress.save.mock.calls.map(([step]) => step)).toEqual([3, 4, 5]);
    expect(api.createCustomer).not.toHaveBeenCalled();
    expect(api.createProduct).not.toHaveBeenCalled();
    expect(staff.create).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(["/sell"]);
  });

  it("creates staff individually and keeps the form step separate from next", async () => {
    page.currentStep.set(2);
    staff.create
      .mockResolvedValueOnce("staff-1")
      .mockResolvedValueOnce("staff-2");
    await page.saveStaff();
    await page.saveStaff();
    expect(staff.create).toHaveBeenCalledTimes(2);
    expect(page.staff()).toHaveLength(2);
    expect(page.currentStep()).toBe(2);
    expect(progress.save).not.toHaveBeenCalled();
  });

  it("resets the reused staff form after create and shows a read-only table on the same step", async () => {
    progress.step.mockReturnValue(2);
    user.set({ ...OWNER, storeId: STORE.id });
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    for (const [name, value] of Object.entries({
      name: "Cashier",
      email: "cashier@example.com",
      password: "password123",
      confirmPassword: "password123",
    })) {
      const input = root.querySelector<HTMLInputElement>(
        `input[formControlName="${name}"]`,
      )!;
      input.value = value;
      input.dispatchEvent(new Event("input"));
    }
    fixture.detectChanges();
    root
      .querySelector<HTMLButtonElement>('app-user-form button[type="submit"]')!
      .click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(staff.create).toHaveBeenCalledTimes(1);
    expect(
      root.querySelector<HTMLInputElement>('input[formControlName="password"]')!
        .value,
    ).toBe("");
    expect(root.querySelector("app-user-form mat-error")).toBeNull();
    expect(
      root.querySelector("app-user-form .mat-form-field-invalid"),
    ).toBeNull();
    expect(root.querySelector("app-user-table")?.textContent).toContain(
      "cashier@example.com",
    );
    expect(root.querySelector('app-user-table tr[role="link"]')).toBeNull();
    expect(root.textContent).toContain("Step 3 of 5");
    expect(progress.save).not.toHaveBeenCalled();
  });

  it("retains the step and displays failed record creation", async () => {
    page.currentStep.set(3);
    api.createCustomer.mockRejectedValue(new Error("Name already exists"));
    await page.saveCustomer();
    expect(page.failure()).toBe("Name already exists");
    expect(page.customerRows()).toHaveLength(0);
    expect(page.currentStep()).toBe(3);
  });

  it("blocks mutations and progression while offline", async () => {
    online.set(false);
    await page.saveStore();
    page.currentStep.set(2);
    await page.saveStaff();
    await page.advance();
    expect(storeApi.createStore).not.toHaveBeenCalled();
    expect(staff.create).not.toHaveBeenCalled();
    expect(progress.save).not.toHaveBeenCalled();
    expect(page.currentStep()).toBe(2);
    expect(page.failure()).toBe("offline");
  });
});
