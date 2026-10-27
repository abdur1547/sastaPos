import { TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { signal } from "@angular/core";
import { BehaviorSubject, of, throwError } from "rxjs";

import { VendorService } from "../../vendor.service";
import { Vendor } from "../../vendor.model";
import {
  VendorLedgerPage as LedgerPageModel,
  VendorLedgerSummary,
} from "../../vendor-ledger.model";
import { AuthService } from "../../../../core/auth/auth.service";
import { VendorLedgerPage } from "./vendor-ledger.page";

jest.mock("../../../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("VendorLedgerPage", () => {
  const vendor: Vendor = {
    id: "vendor-1",
    name: "Al-Rehman Traders",
    phoneNumber: "03001234567",
    ntn: "1234567-8",
    strn: "9876543-2",
    address: "Main Market, Lahore",
    status: "ACTIVE",
    salesTaxRegistrationStatus: "REGISTERED",
    accountBalance: "-1500.00",
    storeId: "store-1",
    dateCreated: "2026-01-01T00:00:00Z",
    lastUpdated: "2026-01-01T00:00:00Z",
  };

  const emptyLedger: LedgerPageModel = {
    items: [],
    total: 0,
    totalDebit: "0.00",
    totalCredit: "0.00",
  };

  const sampleSummary: VendorLedgerSummary = {
    currentBalance: "-1500.00",
    openingBalance: "0.00",
    closingBalance: "-1500.00",
    debitTotal: "0.00",
    creditTotal: "0.00",
  };

  let vendorChanges: BehaviorSubject<Vendor | null>;
  let watchLedger: jest.Mock;
  let getLedgerSummary: jest.Mock;

  beforeEach(async () => {
    vendorChanges = new BehaviorSubject<Vendor | null>(vendor);
    watchLedger = jest.fn().mockReturnValue(of(emptyLedger));
    getLedgerSummary = jest.fn().mockResolvedValue(sampleSummary);

    await TestBed.configureTestingModule({
      imports: [VendorLedgerPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: "vendor-1" })) },
        },
        {
          provide: VendorService,
          useValue: {
            watchById: () => vendorChanges,
            watchLedger,
            getLedgerSummary,
            voidPayment: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal({
              id: "u1",
              name: "Owner",
              email: "owner@pos.test",
              role: "OWNER",
              status: "ACTIVE",
              storeId: "store-1",
            }),
          },
        },
      ],
    }).compileComponents();
  });

  it("shows vendor details, totals, and an empty table with clear message matching the reference design", async () => {
    const fixture = TestBed.createComponent(VendorLedgerPage);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 50));
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector(".section-label")?.textContent).toContain("Al-Rehman Traders");
    expect(element.querySelector("h1")?.textContent).toBe("Vendor Ledger");
    expect(element.querySelector(".heading-actions a")?.getAttribute("href")).toBe(
      "/vendors/vendor-1/payments/new",
    );
    expect(element.querySelector("h2")?.textContent).toContain("Al-Rehman Traders");
    expect(element.querySelector(".balance")?.textContent).toContain(
      "You owe vendor Rs 1500.00",
    );

    // Transactions totals header matching reference design
    expect(element.querySelector(".ledger-totals")?.textContent).toContain("Rs 0.00");

    // Table is present and shows clear empty state
    const emptyRow = element.querySelector(".empty-row");
    expect(emptyRow).toBeTruthy();
    expect(emptyRow?.querySelector("mat-icon")?.textContent?.trim()).toBe("account_balance_wallet");
    expect(emptyRow?.textContent).toContain("No ledger entries match the current filters.");
    expect(emptyRow?.textContent).toContain("Try a wider period or reset the filters.");
  });

  it("shows ledger load errors without hiding the vendor information", () => {
    watchLedger.mockImplementation(() =>
      throwError(() => new Error("Database timeout while reading ledger.")),
    );

    const fixture = TestBed.createComponent(VendorLedgerPage);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector(".section-label")?.textContent).toContain("Al-Rehman Traders");
    expect(element.querySelector("h1")?.textContent).toBe("Vendor Ledger");
    expect(element.querySelector("h2")?.textContent).toContain("Al-Rehman Traders");
    expect(element.querySelector(".load-error")?.textContent).toContain(
      "Database timeout while reading ledger.",
    );
  });
});
