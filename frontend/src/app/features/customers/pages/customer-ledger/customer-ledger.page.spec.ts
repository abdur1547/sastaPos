import { TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { BehaviorSubject, of } from "rxjs";

import { CustomerService } from "../../customer.service";
import { Customer } from "../../customer.model";
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
  let changes: BehaviorSubject<Customer>;

  beforeEach(async () => {
    changes = new BehaviorSubject(customer);
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
          useValue: { watchById: () => changes },
        },
      ],
    }).compileComponents();
  });

  it("shows customer information, edit and payment links, without a transaction table", () => {
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
    expect(element.querySelector("table")).toBeNull();
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
