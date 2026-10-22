import { TestBed } from "@angular/core/testing";
import { firstValueFrom, of } from "rxjs";

import { DatabaseService } from "../../core/database/database.service";
import { CustomerPersistenceError } from "./customer.errors";
import {
  DEFAULT_LEDGER_FILTERS,
  DEFAULT_LEDGER_SORT,
} from "./customer-ledger.model";
import {
  CustomerLedgerQuery,
  CustomerLedgerRepository,
} from "./customer-ledger.repository";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

const BASE_QUERY: CustomerLedgerQuery = {
  customerId: "customer",
  storeId: "store",
  filters: DEFAULT_LEDGER_FILTERS,
  range: { from: null, to: null },
};

function placeholders(sql: string): number {
  return sql.match(/\?/g)?.length ?? 0;
}

describe("CustomerLedgerRepository", () => {
  const watch = jest.fn();
  let repository: CustomerLedgerRepository;

  beforeEach(() => {
    watch.mockReset().mockReturnValue(of([]));
    TestBed.configureTestingModule({
      providers: [{ provide: DatabaseService, useValue: { watch } }],
    });
    repository = TestBed.inject(CustomerLedgerRepository);
  });

  it("scopes to the customer in the store, newest first, with a running balance and paging", () => {
    repository
      .watchPage(BASE_QUERY, DEFAULT_LEDGER_SORT, { pageIndex: 2, pageSize: 25 })
      .subscribe();

    const [sql, parameters] = watch.mock.calls[0];
    expect(sql).toContain("FROM ledger_entries l");
    expect(sql).toContain("WHERE l.customer_id = ? AND c.store_id = ?");
    expect(sql).toContain("ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW");
    expect(sql).toContain("ORDER BY f.seq DESC NULLS LAST, f.seq DESC");
    expect(sql).not.toContain("occurred_at >=");
    expect(placeholders(sql)).toBe(parameters.length);
    expect(parameters).toEqual(["customer", "store", 25, 50]);
  });

  it("combines every filter with an escaped search", () => {
    repository
      .watchPage(
        {
          ...BASE_QUERY,
          range: { from: "2026-01-01 00:00:00", to: "2026-02-01 00:00:00" },
          filters: {
            ...DEFAULT_LEDGER_FILTERS,
            search: "INV_1",
            type: "PAYMENT",
            direction: "CREDIT",
            status: "VOIDED",
          },
        },
        { field: "referenceNumber", direction: "asc" },
        { pageIndex: 0, pageSize: 10 },
      )
      .subscribe();

    const [sql, parameters] = watch.mock.calls[0];
    expect(sql).toContain("occurred_at >= ?");
    expect(sql).toContain("occurred_at < ?");
    expect(sql).toContain("reference_number LIKE ?");
    expect(sql).toContain("type = ?");
    expect(sql).toContain("direction = ?");
    expect(sql).toContain("COALESCE(voided, 0) = 1");
    expect(sql).toContain(
      "ORDER BY length(f.reference_number) ASC NULLS LAST, f.reference_number COLLATE NOCASE ASC NULLS LAST, f.seq ASC",
    );
    expect(placeholders(sql)).toBe(parameters.length);
    expect(parameters).toEqual([
      "customer",
      "store",
      "2026-01-01 00:00:00",
      "2026-02-01 00:00:00",
      "%INV\\_1%",
      "%INV\\_1%",
      "%INV\\_1%",
      "PAYMENT",
      "CREDIT",
      10,
      0,
    ]);
  });

  it.each([
    ["debit", "CASE WHEN f.direction = 'DEBIT' THEN f.amount_cents END DESC NULLS LAST"],
    ["credit", "CASE WHEN f.direction = 'CREDIT' THEN f.amount_cents END DESC NULLS LAST"],
    ["balance", "f.balance_cents DESC NULLS LAST"],
    ["type", "f.type COLLATE NOCASE DESC NULLS LAST"],
    ["description", "f.description COLLATE NOCASE DESC NULLS LAST"],
  ] as const)("sorts by %s", (field, order) => {
    repository
      .watchPage(BASE_QUERY, { field, direction: "desc" }, { pageIndex: 0, pageSize: 10 })
      .subscribe();
    expect(watch.mock.calls[0][0]).toContain(`ORDER BY ${order}, f.seq DESC`);
  });

  it("maps rows and totals into a ledger page", async () => {
    watch.mockReturnValue(
      of([
        {
          id: "entry",
          direction: "CREDIT",
          amount: "50",
          type: "PAYMENT",
          reference_number: null,
          description: "Cash",
          voided: 1,
          void_reason: "Entered twice",
          sale_id: null,
          date_created: "2026-03-01 10:00:00",
          balance_cents: -2550,
          total_count: 3,
          debit_cents: 10000,
          credit_cents: 12550,
        },
      ]),
    );

    const page = await firstValueFrom(
      repository.watchPage(BASE_QUERY, DEFAULT_LEDGER_SORT, { pageIndex: 0, pageSize: 10 }),
    );

    expect(page).toEqual({
      total: 3,
      totalDebit: "100.00",
      totalCredit: "125.50",
      items: [
        {
          id: "entry",
          occurredAt: new Date("2026-03-01T10:00:00Z"),
          direction: "CREDIT",
          type: "PAYMENT",
          amount: "50.00",
          referenceNumber: null,
          description: "Cash",
          voided: true,
          voidReason: "Entered twice",
          saleId: null,
          balanceAfter: "-25.50",
        },
      ],
    });
  });

  it("returns an empty page when nothing matches", async () => {
    const page = await firstValueFrom(
      repository.watchPage(BASE_QUERY, DEFAULT_LEDGER_SORT, { pageIndex: 0, pageSize: 10 }),
    );
    expect(page).toEqual({ items: [], total: 0, totalDebit: "0.00", totalCredit: "0.00" });
  });

  it("rejects corrupt local rows", async () => {
    watch.mockReturnValue(
      of([{ id: "entry", direction: "SIDEWAYS", date_created: "2026-03-01", balance_cents: 0 }]),
    );
    await expect(
      firstValueFrom(
        repository.watchPage(BASE_QUERY, DEFAULT_LEDGER_SORT, { pageIndex: 0, pageSize: 10 }),
      ),
    ).rejects.toBeInstanceOf(CustomerPersistenceError);
  });
});
