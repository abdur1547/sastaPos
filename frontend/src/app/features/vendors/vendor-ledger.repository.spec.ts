import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";

import { DatabaseService } from "../../core/database/database.service";
import {
  DEFAULT_VENDOR_LEDGER_FILTERS,
  VendorLedgerFilters,
} from "./vendor-ledger.model";
import {
  VendorLedgerQuery,
  VendorLedgerRepository,
} from "./vendor-ledger.repository";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

const BASE_QUERY: VendorLedgerQuery = {
  vendorId: "v-1",
  storeId: "store-1",
  filters: DEFAULT_VENDOR_LEDGER_FILTERS,
  range: { from: null, to: null },
};

function placeholders(sql: string): number {
  return sql.match(/\?/g)?.length ?? 0;
}

describe("VendorLedgerRepository", () => {
  const watch = jest.fn();
  const getOptional = jest.fn();
  let repository: VendorLedgerRepository;

  beforeEach(() => {
    watch.mockReset().mockReturnValue(of([]));
    getOptional.mockReset().mockResolvedValue(null);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DatabaseService,
          useValue: { watch, getOptional },
        },
      ],
    });
    repository = TestBed.inject(VendorLedgerRepository);
  });

  describe("watchPage", () => {
    it("scopes to the vendor in the store, newest first, with a running balance and paging", () => {
      repository
        .watchPage(
          BASE_QUERY,
          { field: "occurredAt", direction: "desc" },
          { pageIndex: 2, pageSize: 25 },
        )
        .subscribe();

      const [sql, parameters] = watch.mock.calls[0];
      expect(sql).toContain("FROM ledger_entries l");
      expect(sql).toContain("WHERE l.vendor_id = ? AND v.store_id = ?");
      expect(sql).toContain("ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW");
      expect(sql).toContain("ORDER BY f.seq DESC NULLS LAST, f.seq DESC");
      expect(placeholders(sql)).toBe(parameters.length);
      expect(parameters).toEqual(["v-1", "store-1", 25, 50]);
    });

    it("applies filters by date range, type, direction and status", () => {
      const filters: VendorLedgerFilters = {
        search: "INV-001",
        datePreset: "custom",
        customFrom: "2026-10-01",
        customTo: "2026-10-31",
        type: "PURCHASE",
        direction: "CREDIT",
        status: "ACTIVE",
      };

      repository
        .watchPage(
          {
            ...BASE_QUERY,
            filters,
            range: { from: "2026-10-01T00:00:00Z", to: "2026-10-31T23:59:59Z" },
          },
          { field: "occurredAt", direction: "desc" },
          { pageIndex: 0, pageSize: 10 },
        )
        .subscribe();

      const [sql, parameters] = watch.mock.calls[0];
      expect(sql).toContain("occurred_at >= ?");
      expect(sql).toContain("occurred_at < ?");
      expect(sql).toContain("type = ?");
      expect(sql).toContain("direction = ?");
      expect(sql).toContain("COALESCE(voided, 0) = 0");
      expect(placeholders(sql)).toBe(parameters.length);
    });
  });

  describe("getSummary", () => {
    it("computes summary values including opening/closing balances and debit/credit totals", async () => {
      getOptional
        .mockResolvedValueOnce({ account_balance: "-1500.00" }) // vendorRow
        .mockResolvedValueOnce({ balance: -50000 }) // opening: -500.00
        .mockResolvedValueOnce({ balance: -150000 }) // closing: -1500.00
        .mockResolvedValueOnce({ debit: 100000, credit: 200000 }); // debit: 1000.00, credit: 2000.00

      const summary = await repository.getSummary({
        ...BASE_QUERY,
        range: { from: "2026-10-01", to: "2026-10-31" },
      });

      expect(summary.currentBalance).toBe("-1500.00");
      expect(summary.openingBalance).toBe("-500.00");
      expect(summary.closingBalance).toBe("-1500.00");
      expect(summary.debitTotal).toBe("1000.00");
      expect(summary.creditTotal).toBe("2000.00");
    });
  });
});

