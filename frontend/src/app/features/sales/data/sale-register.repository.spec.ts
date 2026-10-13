import { TestBed } from "@angular/core/testing";
import { firstValueFrom, of } from "rxjs";

import { DatabaseService } from "../../../core/database/database.service";
import { DEFAULT_SALE_REGISTER_FILTERS, DEFAULT_SALE_SORT } from "../models/sale-register.model";
import { RegisterQuery, SaleRegisterRepository } from "./sale-register.repository";

jest.mock("../../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

const BASE_QUERY: RegisterQuery = {
  storeId: "store",
  filters: DEFAULT_SALE_REGISTER_FILTERS,
  range: { from: "2026-01-01 00:00:00", to: "2026-01-02 00:00:00" },
};

function placeholders(sql: string): number {
  return sql.match(/\?/g)?.length ?? 0;
}

describe("SaleRegisterRepository", () => {
  const watch = jest.fn();
  let repository: SaleRegisterRepository;

  beforeEach(() => {
    watch.mockReset().mockReturnValue(of([]));
    TestBed.configureTestingModule({
      providers: [{ provide: DatabaseService, useValue: { watch } }],
    });
    repository = TestBed.inject(SaleRegisterRepository);
  });

  it("lists only posted sales in the period, newest first, and binds every placeholder", () => {
    repository.watchPage(BASE_QUERY, DEFAULT_SALE_SORT, { pageIndex: 2, pageSize: 25 }).subscribe();

    const [sql, parameters] = watch.mock.calls[0];
    expect(sql).toContain("s.status IN ('COMPLETED', 'VOIDED')");
    expect(sql).toContain("datetime(s.sold_at) >= ?");
    expect(sql).toContain("datetime(s.sold_at) < ?");
    expect(sql).toContain("ORDER BY datetime(s.sold_at) DESC, s.id DESC");
    expect(placeholders(sql)).toBe(parameters.length);
    expect(parameters.slice(-2)).toEqual([25, 50]);
  });

  it("combines every filter with an escaped search", () => {
    repository
      .watchPage(
        {
          storeId: "store",
          range: { from: null, to: null },
          filters: {
            ...DEFAULT_SALE_REGISTER_FILTERS,
            search: "INV_1",
            status: "VOIDED",
            saleType: "CREDIT",
            paymentMethod: "BANK",
            cashierId: "cashier",
            outstandingOnly: true,
          },
        },
        { field: "invoiceNumber", direction: "asc" },
        { pageIndex: 0, pageSize: 10 },
      )
      .subscribe();

    const [sql, parameters] = watch.mock.calls[0];
    expect(sql).not.toContain("datetime(s.sold_at) >=");
    expect(sql).toContain("s.status = ?");
    expect(sql).toContain("c.phone_number LIKE ?");
    expect(sql).toContain("p.method = ?");
    expect(sql).toContain("s.user_id = ?");
    expect(sql).toContain("CAST(s.remaining AS REAL) > 0");
    expect(sql).toContain("ORDER BY length(s.invoice_number) ASC, s.invoice_number COLLATE NOCASE ASC");
    expect(placeholders(sql)).toBe(parameters.length);
    expect(parameters).toEqual(expect.arrayContaining(["VOIDED", "%INV\\_1%", "CREDIT", "BANK", "cashier"]));
  });

  it("maps rows into list items", async () => {
    watch.mockReturnValue(
      of([
        {
          id: "s1",
          invoice_number: "INV-1",
          sold_at: "2026-01-01 10:00:00",
          status: "COMPLETED",
          sale_type: "CREDIT",
          total_amount: "100",
          total_paid: 40,
          remaining: "60.00",
          customer_id: "c1",
          customer_name: "Ali",
          cashier_name: "Sara",
          item_count: 3,
          payment_methods: "CASH,BANK",
          total_count: 7,
        },
      ]),
    );

    const page = await firstValueFrom(
      repository.watchPage(BASE_QUERY, DEFAULT_SALE_SORT, { pageIndex: 0, pageSize: 25 }),
    );

    expect(page.total).toBe(7);
    expect(page.items[0]).toEqual(
      expect.objectContaining({
        invoiceNumber: "INV-1",
        soldAt: new Date("2026-01-01T10:00:00Z"),
        customer: { id: "c1", name: "Ali" },
        totalAmount: "100.00",
        totalPaid: "40.00",
        remaining: "60.00",
        itemCount: 3,
        paymentMethods: ["BANK", "CASH"],
      }),
    );
  });

  it("summarises completed sales and reports voids separately", async () => {
    watch.mockReturnValue(
      of([
        {
          sale_count: 3,
          net_sales: "100.00",
          collected: "70.00",
          outstanding: "30.00",
          voided_count: 1,
          voided_amount: "25.00",
        },
      ]),
    );

    const summary = await firstValueFrom(repository.watchSummary(BASE_QUERY));

    const [sql, parameters] = watch.mock.calls[0];
    expect(placeholders(sql)).toBe(parameters.length);
    expect(summary).toEqual({
      saleCount: 3,
      netSales: "100.00",
      collected: "70.00",
      outstanding: "30.00",
      averageSale: "33.33",
      voidedCount: 1,
      voidedAmount: "25.00",
    });
  });
});
