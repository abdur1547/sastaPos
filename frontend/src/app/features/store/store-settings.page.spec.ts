import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Subject, of, throwError } from "rxjs";

import { AuthService } from "../../core/auth/auth.service";
import { ApiError } from "../../core/http/api-error.model";
import { StoreApiService } from "./store-api.service";
import { StoreSettingsPage } from "./store-settings.page";
import { Store, StoreSettings } from "./store.model";

const STORE: Store = {
  id: "store-1",
  name: "Downtown",
  ntn: "123",
  address: null,
  currencyCode: "PKR",
  timezone: "Asia/Karachi",
  status: "ACTIVE",
  storeSettings: {
    id: "settings-1",
    invoicePrefix: "INV",
    invoiceNumberStart: 1,
    nextInvoiceNumber: 42,
    receiptFooter: "Thank you",
  },
};

class TestStoreSettingsPage extends StoreSettingsPage {
  readonly profile = this.profileForm;
  readonly invoices = this.settingsForm;
  readonly currentStore = this.store;
  readonly profileFailure = this.profileError;
  readonly settingsFailure = this.settingsError;
  readonly loadingFailure = this.loadError;
  readonly pending = this.saving;

  reload(): Promise<void> {
    return this.load();
  }
  saveDetails(): Promise<void> {
    return this.saveProfile();
  }
  saveInvoices(): Promise<void> {
    return this.saveSettings();
  }
  discardDetails(): void {
    this.resetProfile();
  }
  unload(event: BeforeUnloadEvent): void {
    this.beforeUnload(event);
  }
}

describe("StoreSettingsPage", () => {
  const api = {
    getStore: jest.fn(),
    updateStore: jest.fn(),
    updateSettings: jest.fn(),
  };
  const snackBar = { open: jest.fn() };
  const dialog = { open: jest.fn() };
  const auth = { isAuthenticated: jest.fn() };
  let page: TestStoreSettingsPage;

  beforeEach(async () => {
    jest.resetAllMocks();
    api.getStore.mockReturnValue(of(STORE));
    api.updateStore.mockReturnValue(of(STORE));
    api.updateSettings.mockReturnValue(of(STORE.storeSettings));
    auth.isAuthenticated.mockReturnValue(true);
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    TestBed.configureTestingModule({
      imports: [StoreSettingsPage],
      providers: [
        { provide: StoreApiService, useValue: api },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: MatDialog, useValue: dialog },
        { provide: AuthService, useValue: auth },
      ],
    });
    page = TestBed.runInInjectionContext(() => new TestStoreSettingsPage());
    await page.reload();
  });

  it("loads existing server values and starts with clean forms", () => {
    expect(page.profile.getRawValue()).toEqual({
      name: "Downtown",
      ntn: "123",
      address: "",
      currencyCode: "PKR",
      timezone: "Asia/Karachi",
      status: "ACTIVE",
    });
    expect(page.invoices.controls.invoiceNumberStart.value).toBe(1);
    expect(page.profile.dirty).toBe(false);
    expect(page.invoices.dirty).toBe(false);
  });

  it("renders the online-only notice, server invoice number, and accessible forms", async () => {
    const fixture = TestBed.createComponent(StoreSettingsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain("Online only");
    expect(element.textContent).toContain("Next invoice number: 42");
    expect(element.querySelectorAll("form")).toHaveLength(2);
    expect(
      element.querySelector('textarea[formControlName="receiptFooter"]'),
    ).not.toBeNull();
  });

  it("patches only changed details and preserves unsaved invoice edits", async () => {
    page.profile.controls.name.setValue("New name");
    page.profile.controls.name.markAsDirty();
    page.invoices.controls.receiptFooter.setValue("Unsaved footer");
    page.invoices.controls.receiptFooter.markAsDirty();
    api.updateStore.mockReturnValue(of({ ...STORE, name: "Server name" }));
    await page.saveDetails();
    expect(api.updateStore).toHaveBeenCalledWith({ name: "New name" });
    expect(page.profile.controls.name.value).toBe("Server name");
    expect(page.profile.dirty).toBe(false);
    expect(page.invoices.controls.receiptFooter.value).toBe("Unsaved footer");
    expect(page.invoices.dirty).toBe(true);
  });

  it("saves zero and empty strings, and uses the settings response without losing profile edits", async () => {
    page.profile.controls.name.setValue("Unsaved name");
    page.profile.controls.name.markAsDirty();
    page.invoices.controls.invoiceNumberStart.setValue(0);
    page.invoices.controls.invoiceNumberStart.markAsDirty();
    page.invoices.controls.receiptFooter.setValue("");
    page.invoices.controls.receiptFooter.markAsDirty();
    api.updateSettings.mockReturnValue(
      of({
        ...STORE.storeSettings,
        invoiceNumberStart: 0,
        nextInvoiceNumber: 99,
        receiptFooter: "",
      }),
    );
    await page.saveInvoices();
    expect(api.updateSettings).toHaveBeenCalledWith({
      invoiceNumberStart: 0,
      receiptFooter: "",
    });
    expect(page.currentStore()?.storeSettings.nextInvoiceNumber).toBe(99);
    expect(page.invoices.dirty).toBe(false);
    expect(page.profile.controls.name.value).toBe("Unsaved name");
    expect(page.profile.dirty).toBe(true);
  });

  it.each([null, -1, 1.5, 2147483648])(
    "rejects invalid invoice start %s",
    async (value) => {
      page.invoices.controls.invoiceNumberStart.setValue(value);
      page.invoices.controls.invoiceNumberStart.markAsDirty();
      await page.saveInvoices();
      expect(api.updateSettings).not.toHaveBeenCalled();
      expect(page.invoices.controls.invoiceNumberStart.touched).toBe(true);
    },
  );

  it("enforces Swagger string limits and accepts their exact boundaries", () => {
    for (const [control, maximum] of [
      [page.profile.controls.name, 255],
      [page.profile.controls.ntn, 255],
      [page.profile.controls.address, 1000],
      [page.profile.controls.currencyCode, 10],
      [page.profile.controls.timezone, 100],
      [page.invoices.controls.invoicePrefix, 50],
      [page.invoices.controls.receiptFooter, 1000],
    ] as const) {
      control.setValue("x".repeat(maximum));
      expect(control.valid).toBe(true);
      control.setValue("x".repeat(maximum + 1));
      expect(control.hasError("maxlength")).toBe(true);
    }
    page.invoices.controls.invoiceNumberStart.setValue(2147483647);
    expect(page.invoices.controls.invoiceNumberStart.valid).toBe(true);
  });

  it("keeps edits on network failure and retries the same request successfully", async () => {
    page.invoices.controls.invoicePrefix.setValue("NEW");
    page.invoices.controls.invoicePrefix.markAsDirty();
    api.updateSettings.mockReturnValue(
      throwError(() => new ApiError("network", 0, "Cannot reach the server.")),
    );
    await page.saveInvoices();
    expect(page.settingsFailure()).toBe("Cannot reach the server.");
    expect(page.invoices.controls.invoicePrefix.value).toBe("NEW");
    expect(page.invoices.dirty).toBe(true);
    expect(snackBar.open).not.toHaveBeenCalled();
    api.updateSettings.mockReturnValue(
      of({ ...STORE.storeSettings, invoicePrefix: "NEW" }),
    );
    await page.saveInvoices();
    expect(page.settingsFailure()).toBe("");
    expect(page.invoices.dirty).toBe(false);
  });

  it("maps backend field errors to their controls", async () => {
    page.profile.controls.timezone.setValue("invalid");
    page.profile.controls.timezone.markAsDirty();
    api.updateStore.mockReturnValue(
      throwError(
        () =>
          new ApiError("validation", 400, "Invalid timezone", null, [
            { property: "timezone", message: "Use an IANA timezone." },
          ]),
      ),
    );
    await page.saveDetails();
    expect(page.profile.controls.timezone.getError("server")).toBe(
      "Use an IANA timezone.",
    );
    expect(page.profile.controls.timezone.touched).toBe(true);
    expect(page.profile.dirty).toBe(true);
  });

  it("shows load failures and permits retry", async () => {
    api.getStore.mockReturnValue(
      throwError(() => new ApiError("server", 500, "Unavailable")),
    );
    await page.reload();
    expect(page.loadingFailure()).toBe("Unavailable");
    api.getStore.mockReturnValue(of(STORE));
    await page.reload();
    expect(page.loadingFailure()).toBe("");
  });

  it("does not duplicate requests or allow navigation while saving", async () => {
    const response = new Subject<StoreSettings>();
    api.updateSettings.mockReturnValue(response);
    page.invoices.controls.invoicePrefix.markAsDirty();
    const save = page.saveInvoices();
    expect(page.pending()).toBe("settings");
    await page.saveInvoices();
    expect(api.updateSettings).toHaveBeenCalledTimes(1);
    expect(await page.canLeave()).toBe(false);
    response.next(STORE.storeSettings);
    response.complete();
    await save;
    expect(page.pending()).toBeNull();
  });

  it("requires confirmation to deactivate and retains edits when cancelled", async () => {
    page.profile.controls.status.setValue("INACTIVE");
    page.profile.controls.status.markAsDirty();
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    await page.saveDetails();
    expect(dialog.open).toHaveBeenCalled();
    expect(api.updateStore).not.toHaveBeenCalled();
    expect(page.profile.dirty).toBe(true);
    expect(page.pending()).toBeNull();
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    api.updateStore.mockReturnValue(of({ ...STORE, status: "INACTIVE" }));
    await page.saveDetails();
    expect(api.updateStore).toHaveBeenCalledWith({ status: "INACTIVE" });
  });

  it("guards unsaved navigation but allows an expired session to redirect", async () => {
    expect(await page.canLeave()).toBe(true);
    page.profile.controls.name.markAsDirty();
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    expect(await page.canLeave()).toBe(false);
    const event = new Event("beforeunload", { cancelable: true });
    page.unload(event as BeforeUnloadEvent);
    expect(event.defaultPrevented).toBe(true);
    auth.isAuthenticated.mockReturnValue(false);
    expect(await page.canLeave()).toBe(true);
  });

  it("discards only the selected section", () => {
    page.profile.controls.name.setValue("Edit");
    page.profile.controls.name.markAsDirty();
    page.invoices.controls.receiptFooter.markAsDirty();
    page.discardDetails();
    expect(page.profile.controls.name.value).toBe(STORE.name);
    expect(page.profile.dirty).toBe(false);
    expect(page.invoices.dirty).toBe(true);
  });

  it("prefills onboarding suggestions, saves them, then emits completion", async () => {
    api.getStore.mockReturnValue(
      of({
        ...STORE,
        storeSettings: {
          ...STORE.storeSettings,
          invoicePrefix: null,
          receiptFooter: null,
        },
      }),
    );
    const fixture = TestBed.createComponent(StoreSettingsPage);
    fixture.componentRef.setInput("onboarding", true);
    const completed = jest.fn();
    fixture.componentInstance.completed.subscribe(completed);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(
      root.querySelector<HTMLInputElement>(
        'app-form-field[label="Invoice prefix"] input',
      )?.value,
    ).toBe("INV-");
    expect(
      root.querySelector<HTMLTextAreaElement>(
        'textarea[formControlName="receiptFooter"]',
      )?.value,
    ).toBe("Thank you for shopping with us!");
    const button = Array.from(
      root.querySelectorAll<HTMLButtonElement>("button"),
    ).find((element) => element.textContent?.includes("continue"))!;
    button.click();
    await fixture.whenStable();
    await Promise.resolve();
    expect(api.updateSettings).toHaveBeenCalledWith({
      invoicePrefix: "INV-",
      receiptFooter: "Thank you for shopping with us!",
    });
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it("does not advance onboarding when settings fail to save", async () => {
    api.getStore.mockReturnValue(
      of({
        ...STORE,
        storeSettings: { ...STORE.storeSettings, invoicePrefix: null },
      }),
    );
    api.updateSettings.mockReturnValue(
      throwError(() => new ApiError("server", 500, "Unable to save")),
    );
    const fixture = TestBed.createComponent(StoreSettingsPage);
    fixture.componentRef.setInput("onboarding", true);
    const completed = jest.fn();
    fixture.componentInstance.completed.subscribe(completed);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
      .find((element) => element.textContent?.includes("continue"))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(completed).not.toHaveBeenCalled();
    expect(root.textContent).toContain("Unable to save");
  });
});
