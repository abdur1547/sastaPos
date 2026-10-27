import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { of } from "rxjs";

import { Vendor } from "./vendor.model";
import { VendorService } from "./vendor.service";
import { VENDOR_ROUTES } from "./vendors.routes";
import { AuthService } from "../../core/auth/auth.service";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("vendor routes and navigation", () => {
  const vendor: Vendor = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Alpha Textiles",
    phoneNumber: "+923001112233",
    ntn: "1122334-5",
    strn: "1122334455667",
    salesTaxRegistrationStatus: "REGISTERED",
    address: "Lahore",
    accountBalance: "-1000.00",
    status: "ACTIVE",
    storeId: "store-1",
    dateCreated: "2026-10-27T00:00:00Z",
    lastUpdated: "2026-10-27T00:00:00Z",
  };

  const update = jest.fn();
  const open = jest.fn();

  beforeEach(() => {
    update.mockReset().mockResolvedValue(vendor);
    open.mockReset();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: "vendors", children: VENDOR_ROUTES }]),
        {
          provide: VendorService,
          useValue: {
            findById: async () => vendor,
            watchById: () => of(vendor),
            watch: () => of([vendor]),
            watchPage: () => of({ items: [vendor], total: 1 }),
            watchLedger: () => of({ items: [], total: 0, totalDebit: "0.00", totalCredit: "0.00" }),
            getLedgerSummary: async () => ({
              currentBalance: "-1000.00",
              openingBalance: "0.00",
              closingBalance: "-1000.00",
              debitTotal: "0.00",
              creditTotal: "1000.00",
            }),
            update,
          },
        },
        {
          provide: AuthService,
          useValue: {
            user: () => ({ id: "u-1", role: "OWNER", storeId: "store-1" }),
          },
        },
        { provide: MatSnackBar, useValue: { open } },
      ],
    });
  });

  it("navigates to vendor list", async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);

    await harness.navigateByUrl("/vendors");
    expect(router.url).toBe("/vendors");
  });

  it("navigates to vendor ledger", async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);

    await harness.navigateByUrl(`/vendors/${vendor.id}/ledger`);
    expect(router.url).toBe(`/vendors/${vendor.id}/ledger`);
  });

  it("navigates to vendor new settlement payment form", async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);

    await harness.navigateByUrl(`/vendors/${vendor.id}/payments/new`);
    expect(router.url).toBe(`/vendors/${vendor.id}/payments/new`);
  });

  it("navigates to vendor editor", async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);

    await harness.navigateByUrl(`/vendors/${vendor.id}`);
    expect(router.url).toBe(`/vendors/${vendor.id}`);
  });
});

