import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { of } from "rxjs";

import { Customer } from "./customer.model";
import { CustomerService } from "./customer.service";
import { CUSTOMER_ROUTES } from "./customers.routes";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("customer account navigation", () => {
  const customer: Customer = {
    id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    name: "Ahmed",
    accountBalance: "100.00",
    phoneNumber: null,
    ntn: null,
    status: "ACTIVE",
    storeId: "store",
    dateCreated: "",
    lastUpdated: "",
  };
  const update = jest.fn();
  const open = jest.fn();

  beforeEach(() => {
    update.mockReset().mockResolvedValue(customer);
    open.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: "customers", children: CUSTOMER_ROUTES }]),
        {
          provide: CustomerService,
          useValue: {
            findById: async () => customer,
            watchById: () => of(customer),
            watchPage: () => of({ items: [customer], total: 1 }),
            update,
          },
        },
        { provide: MatSnackBar, useValue: { open } },
      ],
    });
  });

  it("opens a customer ledger directly from the list, then Take Payment and back to the ledger", async () => {
    const harness = await RouterTestingHarness.create("/customers");
    expect(
      harness.routeNativeElement
        ?.querySelector("tbody tr")
        ?.getAttribute("aria-label"),
    ).toBe("Open ledger for Ahmed");
    harness.routeNativeElement?.querySelector<HTMLElement>("tbody tr")?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(`/customers/${customer.id}/ledger`);
    harness.routeNativeElement
      ?.querySelector<HTMLAnchorElement>(".heading-row a")
      ?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(
      `/customers/${customer.id}/payments/new`,
    );
    expect(harness.routeNativeElement?.querySelector("h1")?.textContent).toBe(
      "Take Payment",
    );
    harness.routeNativeElement
      ?.querySelector<HTMLAnchorElement>(".back-link")
      ?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(`/customers/${customer.id}/ledger`);
    harness.routeNativeElement
      ?.querySelector<HTMLAnchorElement>(".back-link")
      ?.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe("/customers");
  });

  it.each(["cancel", "save", "back"])(
    "returns from customer editing to the ledger on %s",
    async (action) => {
      const harness = await RouterTestingHarness.create(
        `/customers/${customer.id}/ledger`,
      );
      harness.routeNativeElement
        ?.querySelector<HTMLAnchorElement>(".edit-customer-link")
        ?.click();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(TestBed.inject(Router).url).toBe(`/customers/${customer.id}`);
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(
        harness.routeNativeElement?.querySelector(".back-link")?.textContent,
      ).toContain("Customer Ledger");
      if (action === "save") {
        const name =
          harness.routeNativeElement!.querySelector<HTMLInputElement>(
            'input[formControlName="name"]',
          )!;
        name.value = "Ahmed";
        name.dispatchEvent(new Event("input"));
        harness.detectChanges();
        harness.routeNativeElement
          ?.querySelector<HTMLFormElement>("form")
          ?.dispatchEvent(new Event("submit", { cancelable: true }));
      } else if (action === "cancel") {
        harness.routeNativeElement
          ?.querySelector<HTMLButtonElement>(".actions button[type='button']")
          ?.click();
      } else {
        harness.routeNativeElement
          ?.querySelector<HTMLAnchorElement>(".back-link")
          ?.click();
      }
      await harness.fixture.whenStable();
      harness.detectChanges();
      if (action === "save") {
        expect(update).toHaveBeenCalled();
        expect(
          harness.routeNativeElement?.querySelector('[role="alert"]')
            ?.textContent ?? "",
        ).toBe("");
        expect(open).toHaveBeenCalled();
        await harness.fixture.whenStable();
      }
      expect(TestBed.inject(Router).url).toBe(
        `/customers/${customer.id}/ledger`,
      );
      if (action === "save") {
        expect(update).toHaveBeenCalledWith(
          customer.id,
          expect.objectContaining({ name: "Ahmed" }),
        );
      } else {
        expect(update).not.toHaveBeenCalled();
      }
    },
  );

  it("preserves an explicit return destination when editing from another workflow", async () => {
    const harness = await RouterTestingHarness.create(
      `/customers/${customer.id}?returnTo=${encodeURIComponent("/customers?search=Ahmed")}`,
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(
      harness.routeNativeElement
        ?.querySelector(".back-link")
        ?.getAttribute("href"),
    ).toBe("/customers?search=Ahmed");
    harness.routeNativeElement
      ?.querySelector<HTMLButtonElement>(".actions button[type='button']")
      ?.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe("/customers?search=Ahmed");
  });

  it("does not show a ledger link for an unsaved customer", async () => {
    const harness = await RouterTestingHarness.create("/customers/new");
    expect(
      harness.routeNativeElement?.querySelector(".ledger-link"),
    ).toBeNull();
    expect(harness.routeNativeElement?.querySelector("h1")?.textContent).toBe(
      "New customer",
    );
  });
});
