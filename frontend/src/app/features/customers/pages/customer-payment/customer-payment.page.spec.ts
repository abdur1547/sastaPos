import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from "@angular/router";
import { MatSnackBar } from "@angular/material/snack-bar";
import { BehaviorSubject, of, throwError } from "rxjs";

import { Customer } from "../../customer.model";
import { CustomerService } from "../../customer.service";
import { CustomerPaymentPage } from "./customer-payment.page";

jest.mock("../../../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("CustomerPaymentPage", () => {
  const customer: Customer = {
    id: "customer",
    name: "Ahmed",
    phoneNumber: null,
    ntn: null,
    accountBalance: "100.00",
    status: "ACTIVE",
    storeId: "store",
    dateCreated: "",
    lastUpdated: "",
  };
  const watchById = jest.fn();
  const takePayment = jest.fn();
  const open = jest.fn();
  let fixture: ComponentFixture<CustomerPaymentPage>;
  let navigate: jest.SpyInstance;

  beforeEach(async () => {
    watchById.mockReset().mockReturnValue(of(customer));
    takePayment.mockReset().mockResolvedValue("75.00");
    open.mockReset();
    await TestBed.configureTestingModule({
      imports: [CustomerPaymentPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: customer.id })) },
        },
        { provide: CustomerService, useValue: { watchById, takePayment } },
        { provide: MatSnackBar, useValue: { open } },
      ],
    }).compileComponents();
    navigate = jest
      .spyOn(TestBed.inject(Router), "navigate")
      .mockResolvedValue(true);
  });

  function render(): HTMLElement {
    fixture = TestBed.createComponent(CustomerPaymentPage);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  function enterAmount(value: string): void {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[formControlName="amount"]',
    );
    input.value = value;
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();
  }

  async function submit(): Promise<void> {
    fixture.nativeElement
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it("renders the customer, defaults to cash, previews balance and saves before returning to the ledger", async () => {
    const element = render();
    expect(element.textContent).toContain("Ahmed");
    expect(element.textContent).toContain("Customer owes you Rs 100.00");
    enterAmount("25.00");
    expect(element.textContent).toContain(
      "After payment: Customer owes you Rs 75.00",
    );
    await submit();
    expect(takePayment).toHaveBeenCalledWith("customer", {
      amount: "25.00",
      method: "CASH",
      referenceNumber: "",
      description: "",
      allowCredit: false,
    });
    expect(navigate).toHaveBeenCalledWith(["/customers", "customer", "ledger"]);
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining("sync when online"),
      "Dismiss",
      expect.any(Object),
    );
  });

  it("rejects empty, zero and excess precision amounts", async () => {
    render();
    for (const amount of ["", "0", "1.001"]) {
      enterAmount(amount);
      await submit();
    }
    expect(takePayment).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("requires explicit credit confirmation and clears it when the amount changes", async () => {
    const element = render();
    enterAmount("150");
    expect(element.textContent).toContain("Customer has Rs 50.00 credit");
    await submit();
    expect(takePayment).not.toHaveBeenCalled();
    const checkbox: HTMLInputElement | null =
      element.querySelector("mat-checkbox input");
    checkbox?.click();
    fixture.detectChanges();
    enterAmount("200");
    expect(checkbox?.checked).toBe(false);
    checkbox?.click();
    fixture.detectChanges();
    await submit();
    expect(takePayment).toHaveBeenCalledWith(
      "customer",
      expect.objectContaining({ allowCredit: true }),
    );
  });

  it("resets credit confirmation if synced balance changes", () => {
    const changes = new BehaviorSubject(customer);
    watchById.mockReturnValue(changes);
    const element = render();
    enterAmount("150");
    const checkbox: HTMLInputElement | null =
      element.querySelector("mat-checkbox input");
    checkbox?.click();
    fixture.detectChanges();
    changes.next({ ...customer, accountBalance: "50.00" });
    fixture.detectChanges();
    expect(checkbox?.checked).toBe(false);
    expect(element.textContent).toContain("Customer has Rs 100.00 credit");
  });

  it("surfaces local write failures, keeps the input and permits retry", async () => {
    const element = render();
    takePayment.mockImplementationOnce(async () => {
      throw new Error("Disk full");
    });
    enterAmount("25");
    await submit();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      "Disk full",
    );
    expect(navigate).not.toHaveBeenCalled();
    await submit();
    expect(takePayment).toHaveBeenCalledTimes(2);
  });

  it("prevents duplicate submits while saving and after a successful save", async () => {
    let finish: (value: string) => void = () => undefined;
    takePayment.mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    );
    render();
    enterAmount("25");
    const form: HTMLFormElement = fixture.nativeElement.querySelector("form");
    form.dispatchEvent(new Event("submit"));
    form.dispatchEvent(new Event("submit"));
    expect(takePayment).toHaveBeenCalledTimes(1);
    finish("75");
    await fixture.whenStable();
    await submit();
    expect(takePayment).toHaveBeenCalledTimes(1);
  });

  it("keeps a successful save non-repeatable when navigation fails", async () => {
    const element = render();
    navigate.mockImplementationOnce(async () => {
      throw new Error("Navigation unavailable");
    });
    enterAmount("25");
    await submit();
    expect(element.textContent).toContain(
      "Payment saved, but navigation failed",
    );
    expect(element.textContent).toContain("Return to ledger");
    await submit();
    expect(takePayment).toHaveBeenCalledTimes(1);
  });

  it.each([of(null), throwError(() => new Error("Database unavailable"))])(
    "does not render an actionable payment form when the customer cannot load",
    (source) => {
      watchById.mockReturnValue(source);
      const element = render();
      expect(element.querySelector("form")).toBeNull();
      expect(element.querySelector('[role="alert"]')).not.toBeNull();
    },
  );
});
