import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { of } from "rxjs";

import { SaleDetail } from "../../models/sale-detail.model";
import { SaleRegisterService } from "../../sale-register.service";
import { SaleDetailPage } from "./sale-detail.page";

jest.mock("../../../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("SaleDetailPage items table", () => {
  let fixture: ComponentFixture<SaleDetailPage>;
  const detail: SaleDetail = {
    header: {
      id: "sale",
      invoiceNumber: "INV-1",
      status: "COMPLETED",
      saleType: "DEBIT",
      soldAt: new Date("2026-01-01T10:00:00Z"),
      currencyCode: "PKR",
      subtotal: "200.00",
      discountAmount: "0.00",
      taxAmount: "35.00",
      totalAmount: "235.00",
      totalPaid: "235.00",
      remaining: "0.00",
      description: null,
      customer: null,
      cashier: { id: "cashier", name: "Cashier" },
      voided: null,
    },
    items: [
      {
        id: "item",
        productId: "product",
        productName: "Widget",
        sku: null,
        quantity: "2.00",
        unitPrice: "100.00",
        taxRate: "0.1750",
        lineSubtotal: "200.00",
        taxAmount: "35.00",
        lineTotal: "235.00",
      },
    ],
    payments: [],
    stockMovements: [],
    ledgerEntries: [],
  };
  const watchDetail = jest.fn();

  beforeEach(async () => {
    watchDetail.mockReset().mockReturnValue(of(detail));
    await TestBed.configureTestingModule({
      imports: [SaleDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: "sale" })) },
        },
        {
          provide: SaleRegisterService,
          useValue: {
            watchDetail,
            canVoid: () => ({ allowed: false, reason: "Not permitted" }),
          },
        },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
      ],
    }).compileComponents();
  });

  function render(): HTMLElement {
    fixture = TestBed.createComponent(SaleDetailPage);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it("shows the same labels and tax-inclusive amounts as the sell page", () => {
    const element = render();
    const table = element.querySelector("table");
    const headers = Array.from(table?.querySelectorAll("th") ?? []).map(
      (cell) => cell.textContent?.trim(),
    );
    const cells = Array.from(table?.querySelectorAll("tbody td") ?? []).map(
      (cell) => cell.textContent?.trim(),
    );

    expect(headers).toEqual([
      "#",
      "Product",
      "Unit price",
      "Units",
      "Line subtotal",
      "Tax %",
      "Tax amount",
      "Line total",
    ]);
    expect(cells).toEqual([
      "1",
      "Widget",
      "Rs 100.00",
      "2.00",
      "Rs 200.00",
      "17.5%",
      "Rs 35.00",
      "Rs 235.00",
    ]);
  });

  it("spans all eight columns when no items are recorded", () => {
    watchDetail.mockReturnValue(of({ ...detail, items: [] }));
    const element = render();

    expect(
      element.querySelector("table .empty-cell")?.getAttribute("colspan"),
    ).toBe("8");
  });
});
