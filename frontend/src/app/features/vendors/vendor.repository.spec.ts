import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";

import { DatabaseExecutor, DatabaseService } from "../../core/database/database.service";
import { DEFAULT_VENDOR_FILTERS } from "./vendor-query.model";
import { VendorRepository } from "./vendor.repository";
import { VendorConflictError } from "./vendor.errors";
import { Vendor } from "./vendor.model";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("VendorRepository", () => {
  const watch = jest.fn();
  const execute = jest.fn();
  const getOptional = jest.fn();
  const getAll = jest.fn();
  const writeTransaction = jest.fn();
  let repository: VendorRepository;

  const mockVendor: Vendor = {
    id: "v-1",
    name: "Supplier Alpha",
    phoneNumber: "+923001234567",
    ntn: "1234567-8",
    strn: "1234567890123",
    salesTaxRegistrationStatus: "REGISTERED",
    address: "Warehouse 12, Lahore",
    accountBalance: "0.00",
    status: "ACTIVE",
    storeId: "store-1",
    dateCreated: "2026-10-27T10:00:00.000Z",
    lastUpdated: "2026-10-27T10:00:00.000Z",
  };

  beforeEach(() => {
    watch.mockReset().mockReturnValue(of([]));
    execute.mockReset().mockResolvedValue({ rows: [], rowsAffected: 1 });
    getOptional.mockReset().mockResolvedValue(null);
    getAll.mockReset().mockResolvedValue([]);
    writeTransaction
      .mockReset()
      .mockImplementation((operation: (tx: DatabaseExecutor) => Promise<unknown>) =>
        operation({
          execute,
          getOptional,
          get: jest.fn(),
          getAll,
        }),
      );

    TestBed.configureTestingModule({
      providers: [
        {
          provide: DatabaseService,
          useValue: { watch, execute, getOptional, getAll, writeTransaction },
        },
      ],
    });
    repository = TestBed.inject(VendorRepository);
  });

  describe("watchPage", () => {
    it("only shows active vendors by default and binds every placeholder", () => {
      repository
        .watchPage("store-1", DEFAULT_VENDOR_FILTERS, { pageIndex: 2, pageSize: 10 })
        .subscribe();

      const [sql, parameters] = watch.mock.calls[0];
      expect(sql).toContain("v.status = ?");
      expect(sql.match(/\?/g)).toHaveLength(parameters.length);
      expect(parameters.slice(-2)).toEqual([10, 20]);
    });

    it("combines search, registration and balance filters", () => {
      repository
        .watchPage(
          "store-1",
          {
            ...DEFAULT_VENDOR_FILTERS,
            search: "Supplier%",
            status: "ALL",
            salesTaxRegistrationStatus: "REGISTERED",
            balanceState: "STORE_OWES_PARTY",
          },
          { pageIndex: 0, pageSize: 25 },
        )
        .subscribe();

      const [sql, parameters] = watch.mock.calls[0];
      expect(sql).not.toContain("v.status = ?");
      expect(sql).toContain("v.sales_tax_registration_status = ?");
      expect(sql).toContain("CAST(v.account_balance AS REAL) < 0");
      expect(sql.match(/\?/g)).toHaveLength(parameters.length);
      expect(parameters).toContain("%Supplier\\%%");
    });
  });

  describe("create", () => {
    it("inserts unique keys and vendor row in one transaction", async () => {
      const created = await repository.create(mockVendor);
      expect(created.name).toBe("Supplier Alpha");
      expect(writeTransaction).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(3); // name unique key, phone unique key, vendor row
    });
  });

  describe("delete", () => {
    it("rejects deletion when account balance is nonzero", async () => {
      getOptional.mockResolvedValueOnce({
        id: "v-1",
        name: "Supplier Alpha",
        phone_number: "+923001234567",
        ntn: null,
        strn: null,
        sales_tax_registration_status: "UNREGISTERED",
        address: null,
        account_balance: "-1500.00", // We owe vendor
        status: "ACTIVE",
        store_id: "store-1",
        date_created: "2026-10-27T10:00:00.000Z",
        last_updated: "2026-10-27T10:00:00.000Z",
      });

      await expect(repository.delete("v-1", "store-1")).rejects.toThrow(
        VendorConflictError,
      );
    });

    it("soft-deletes (deactivates) vendor when balance is zero but history exists", async () => {
      getOptional
        .mockResolvedValueOnce({
          id: "v-1",
          name: "Supplier Alpha",
          phone_number: null,
          ntn: null,
          strn: null,
          sales_tax_registration_status: "UNREGISTERED",
          address: null,
          account_balance: "0.00",
          status: "ACTIVE",
          store_id: "store-1",
          date_created: "2026-10-27T10:00:00.000Z",
          last_updated: "2026-10-27T10:00:00.000Z",
        })
        .mockResolvedValueOnce({ 1: 1 }); // hasPayment

      const result = await repository.delete("v-1", "store-1");
      expect(result.type).toBe("SOFT_DELETED");
      expect(result.vendor?.status).toBe("INACTIVE");
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE vendors SET status = 'INACTIVE'"),
        expect.any(Array),
      );
    });

    it("hard-deletes vendor when balance is zero and no history exists", async () => {
      getOptional
        .mockResolvedValueOnce({
          id: "v-1",
          name: "Supplier Alpha",
          phone_number: null,
          ntn: null,
          strn: null,
          sales_tax_registration_status: "UNREGISTERED",
          address: null,
          account_balance: "0.00",
          status: "ACTIVE",
          store_id: "store-1",
          date_created: "2026-10-27T10:00:00.000Z",
          last_updated: "2026-10-27T10:00:00.000Z",
        })
        .mockResolvedValueOnce(null) // no payments
        .mockResolvedValueOnce(null); // no ledger entries

      const result = await repository.delete("v-1", "store-1");
      expect(result.type).toBe("HARD_DELETED");
      expect(execute).toHaveBeenCalledWith(
        "DELETE FROM vendor_unique_keys WHERE vendor_id = ?",
        ["v-1"],
      );
      expect(execute).toHaveBeenCalledWith(
        "DELETE FROM vendors WHERE id = ? AND store_id = ?",
        ["v-1", "store-1"],
      );
    });
  });
});

