import { TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { BehaviorSubject, of } from "rxjs";

import { CustomerService } from "../../customer.service";
import { Customer } from "../../customer.model";
import {
  CustomerLedgerPage as LedgerPage,
  DEFAULT_LEDGER_FILTERS,
  DEFAULT_LEDGER_SORT,
} from "../../customer-ledger.model";
import { CustomerLedgerPage } from "./customer-ledger.page";

jest.mock("../../../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("CustomerLedgerPage", () => {
  const customer: Customer = {
    id: "customer",
    name: "Ahmed",
    phoneNumber: "03001234567",
    ntn: "1234567",
    status: "ACTIVE",
    accountBalance: "100.00",
    storeId: "store",
    dateCreated: "",
    lastUpdated: "",
  };
  const ledger: LedgerPage = {
    items: [
      {
        id: "entry-2",
        occurredAt: new Date("2026-03-02T10:00:00Z"),
        direction: "CREDIT",
        type: "PAYMENT",
        amount: "50.00",
        referenceNumber: null,
        description: "Cash settlement",
        voided: false,
        voidReason: null,
        saleId: null,
        balanceAfter: "100.00",
      },
      {
        id: "entry-1",
        occurredAt: new Date("2026-03-01T10:00:00Z"),
        direction: "DEBIT",
        type: "SALE",
        amount: "150.00",
        referenceNumber: "INV-7",
        description: "Sale INV-7",
        voided: false,
        voidReason: null,
        saleId: "sale-1",
        balanceAfter: "150.00",
      },
    ],
    total: 2,
    totalDebit: "150.00",
    totalCredit: "50.00",
  };
  let changes: BehaviorSubject<Customer>;
  let watchLedger: jest.Mock;

  beforeEach(async () => {
    changes = new BehaviorSubject(customer);
    watchLedger = jest.fn().mockReturnValue(of(ledger));
    await TestBed.configureTestingModule({
      imports: [CustomerLedgerPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: "customer" })) },
        },
        {
          provide: CustomerService,
          useValue: { watchById: () => changes, watchLedger },
        },
      ],
    }).compileComponents();
  });

  it("shows customer information with edit and payment links", () => {
    const fixture = TestBed.createComponent(CustomerLedgerPage);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector("h1")?.textContent).toBe("Customer Ledger");
    expect(element.querySelector(".heading-row a")?.getAttribute("href")).toBe(
      "/customers/customer/payments/new",
    );
    expect(element.querySelector(".back-link")?.getAttribute("href")).toBe(
      "/customers",
    );
    expect(
      element.querySelector(".edit-customer-link")?.getAttribute("href"),
    ).toBe("/customers/customer");
    const info = element.querySelector(
      'section[aria-label="Customer information"]',
    );
    expect(info?.textContent).toContain("Ahmed");
    expect(info?.textContent).toContain("03001234567");
    expect(info?.textContent).toContain("1234567");
    expect(info?.textContent).toContain("Active");
    expect(info?.textContent).toContain("Customer owes you Rs 100.00");
  });

  it("lists the customer's ledger entries from the local database, newest first", () => {
    const fixture = TestBed.createComponent(CustomerLedgerPage);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    expect(watchLedger).toHaveBeenCalledWith(
      "customer",
      DEFAULT_LEDGER_FILTERS,
      DEFAULT_LEDGER_SORT,
      { pageIndex: 0, pageSize: 25 },
    );
    const rows = element.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Payment");
    expect(rows[0].textContent).toContain("Cash settlement");
    expect(rows[1].textContent).toContain("INV-7");
    expect(rows[1].getAttribute("role")).toBe("link");
    expect(rows[0].getAttribute("role")).toBeNull();
    const section = element.querySelector('section[aria-label="Ledger entries"]');
    expect(section?.textContent).toContain("Rs 150.00");
    expect(section?.textContent).toContain("Rs 50.00");
    expect(section?.textContent).toContain("2 entries");
  });

  it("re-queries from the first page when a column sort changes", () => {
    const fixture = TestBed.createComponent(CustomerLedgerPage);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const balanceHeader = Array.from(element.querySelectorAll<HTMLButtonElement>(".sort-button")).find(
      (button) => button.textContent?.includes("Balance"),
    );

    balanceHeader?.click();
    fixture.detectChanges();

    expect(watchLedger).toHaveBeenLastCalledWith(
      "customer",
      DEFAULT_LEDGER_FILTERS,
      { field: "balance", direction: "desc" },
      { pageIndex: 0, pageSize: 25 },
    );
  });

  it("shows ledger load errors without hiding the customer", () => {
    watchLedger.mockImplementation(() => {
      throw new Error("Ledger unavailable.");
    });
    const fixture = TestBed.createComponent(CustomerLedgerPage);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector(".load-error")?.textContent).toContain("Ledger unavailable.");
    expect(element.querySelector("h1")?.textContent).toBe("Customer Ledger");
  });

  it("updates customer information from local changes and displays missing fields and credit clearly", () => {
    const fixture = TestBed.createComponent(CustomerLedgerPage);
    fixture.detectChanges();
    changes.next({
      ...customer,
      name: "Ahmed Updated",
      phoneNumber: null,
      ntn: null,
      status: "INACTIVE",
      accountBalance: "-25.00",
    });
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain("Ahmed Updated");
    expect(element.textContent?.match(/Not provided/g)).toHaveLength(2);
    expect(element.textContent).toContain("Inactive");
    expect(element.textContent).toContain("Customer has Rs 25.00 credit");
  });
});
