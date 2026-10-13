import { TestBed } from "@angular/core/testing";
import { firstValueFrom, of } from "rxjs";

import { DatabaseService } from "../../../core/database/database.service";
import { SaleDetailRepository } from "./sale-detail.repository";

jest.mock("../../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("SaleDetailRepository", () => {
  const watch = jest.fn();
  let repository: SaleDetailRepository;

  beforeEach(() => {
    watch.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: DatabaseService, useValue: { watch } }],
    });
    repository = TestBed.inject(SaleDetailRepository);
  });

  it.each([
    ["200.00", "235.00", "35.00"],
    ["200.00", "200.00", "0.00"],
    ["0.10", "0.11", "0.01"],
    ["9999999999999999.90", "9999999999999999.99", "0.09"],
  ])(
    "reads the recorded subtotal %s and total %s to derive tax %s",
    async (lineSubtotal, lineTotal, taxAmount) => {
      watch.mockImplementation((sql: string) => {
        if (sql.includes("FROM sales s")) {
          return of([
            {
              id: "sale",
              invoice_number: "INV-1",
              status: "COMPLETED",
              sale_type: "DEBIT",
              sold_at: "2026-01-01 10:00:00",
              user_id: "cashier",
              subtotal: lineSubtotal,
              discount_amount: "0.00",
              tax_amount: taxAmount,
              total_amount: lineTotal,
              total_paid: lineTotal,
              remaining: "0.00",
            },
          ]);
        }
        if (sql.includes("FROM sale_items")) {
          return of([
            {
              id: "item",
              product_id: "product",
              product_name: "Widget",
              sku: null,
              quantity: "2.00",
              unit_price: "100.00",
              tax_rate: "0.1750",
              taxable_amount: lineSubtotal,
              line_total: lineTotal,
            },
          ]);
        }
        return of([]);
      });

      const detail = await firstValueFrom(
        repository.watchDetail("sale", "store"),
      );

      expect(detail?.items[0]).toEqual(
        expect.objectContaining({
          lineSubtotal,
          taxAmount,
          lineTotal,
          taxRate: "0.1750",
        }),
      );
      expect(watch.mock.calls[1][0]).toContain("taxable_amount");
    },
  );
});
