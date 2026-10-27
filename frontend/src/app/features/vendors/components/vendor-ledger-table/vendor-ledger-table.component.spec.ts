import { TestBed } from "@angular/core/testing";
import { VendorLedgerTableComponent } from "./vendor-ledger-table.component";
import { VendorLedgerEntry } from "../../vendor-ledger.model";

describe("VendorLedgerTableComponent", () => {
  it("shows an empty table row with clear wallet icon and message when no entries are present", () => {
    const fixture = TestBed.createComponent(VendorLedgerTableComponent);
    fixture.componentRef.setInput("entries", []);
    fixture.componentRef.setInput("loading", false);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const emptyRow = element.querySelector(".empty-row");
    expect(emptyRow).toBeTruthy();

    const icon = emptyRow?.querySelector("mat-icon");
    expect(icon?.textContent?.trim()).toBe("account_balance_wallet");

    expect(emptyRow?.textContent).toContain("No ledger entries match the current filters.");
    expect(emptyRow?.textContent).toContain("Try a wider period or reset the filters.");
  });

  it("does not show the empty-row while loading is true and entries are empty", () => {
    const fixture = TestBed.createComponent(VendorLedgerTableComponent);
    fixture.componentRef.setInput("entries", []);
    fixture.componentRef.setInput("loading", true);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector(".empty-row")).toBeNull();
    expect(element.querySelector(".loading-bar")).toBeTruthy();
  });

  it("renders ledger rows with debit, credit, balance, and type details", () => {
    const entry: VendorLedgerEntry = {
      id: "e1",
      occurredAt: new Date("2026-03-01T12:00:00Z"),
      direction: "DEBIT",
      type: "PAYMENT",
      amount: "1500.00",
      referenceNumber: "PAY-001",
      description: "Direct bank transfer",
      voided: false,
      voidReason: null,
      paymentId: "p1",
      reversalOfEntryId: null,
      balanceAfter: "0.00",
    };

    const fixture = TestBed.createComponent(VendorLedgerTableComponent);
    fixture.componentRef.setInput("entries", [entry]);
    fixture.componentRef.setInput("loading", false);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector(".empty-row")).toBeNull();
    expect(element.textContent).toContain("PAY-001");
    expect(element.textContent).toContain("Direct bank transfer");
    expect(element.textContent).toContain("+ Rs 1500.00");
    expect(element.textContent).toContain("Settled");
  });
});

