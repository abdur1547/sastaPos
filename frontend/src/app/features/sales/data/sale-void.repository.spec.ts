import { TestBed } from "@angular/core/testing";

import { DatabaseExecutor, DatabaseService } from "../../../core/database/database.service";
import { SaleVoidRefusedError } from "../sales.errors";
import { SaleVoidRepository } from "./sale-void.repository";

jest.mock("../../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

const COMMAND = { saleId: "sale", storeId: "store", userId: "owner", reason: "Customer returned items" };

describe("SaleVoidRepository", () => {
  let executor: jest.Mocked<DatabaseExecutor>;
  let repository: SaleVoidRepository;

  function givenSale(sale: Record<string, unknown> | null): void {
    executor.getOptional.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM sales")) {
        return sale;
      }
      return { account_balance: "500.00" };
    });
  }

  beforeEach(() => {
    executor = {
      execute: jest.fn().mockResolvedValue({ rows: [] }),
      getAll: jest.fn().mockResolvedValue([
        { id: "item-1", product_id: "p1", quantity: "2", stock_quantity: "8.00" },
      ]),
      getOptional: jest.fn(),
      get: jest.fn(),
    } as unknown as jest.Mocked<DatabaseExecutor>;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DatabaseService,
          useValue: { writeTransaction: (operation: (tx: DatabaseExecutor) => Promise<unknown>) => operation(executor) },
        },
      ],
    });
    repository = TestBed.inject(SaleVoidRepository);
  });

  it("returns stock, reverses the customer account and marks the sale voided", async () => {
    givenSale({
      invoice_number: "INV-9",
      status: "COMPLETED",
      total_amount: "150.00",
      total_paid: "100.00",
      customer_id: "cust",
    });

    await repository.voidSale(COMMAND);

    const statements = executor.execute.mock.calls.map(([sql, params]) => ({ sql, params }));
    const movement = statements.find((s) => s.sql.includes("INSERT INTO stock_movements"));
    expect(movement?.sql).toContain("'ADJUSTMENT_IN'");
    expect(movement?.params?.slice(1, 5)).toEqual([
      "2.00",
      "8.00",
      "10.00",
      "Void of sale INV-9: Customer returned items",
    ]);
    expect(statements.find((s) => s.sql.startsWith("UPDATE products"))?.params?.[0]).toBe("10.00");

    const ledger = statements.filter((s) => s.sql.includes("INSERT INTO ledger_entries"));
    expect(ledger.map((s) => [s.params?.[1], s.params?.[2]])).toEqual([
      ["CREDIT", "150.00"],
      ["DEBIT", "100.00"],
    ]);
    // 500 - (150 - 100): only the unpaid part of the bill leaves the customer's balance.
    expect(statements.find((s) => s.sql.startsWith("UPDATE customers"))?.params?.[0]).toBe("450.00");

    const saleUpdate = statements.at(-1);
    expect(saleUpdate?.sql).toContain("status = 'VOIDED'");
    expect(saleUpdate?.params?.[0]).toBe("Customer returned items");
    expect(saleUpdate?.params?.[2]).toBe("owner");
  });

  it("skips ledger entries for a walk-in sale and the payment reversal when nothing was paid", async () => {
    givenSale({
      invoice_number: "INV-10",
      status: "COMPLETED",
      total_amount: "50.00",
      total_paid: "0.00",
      customer_id: null,
    });

    await repository.voidSale(COMMAND);

    const sqls = executor.execute.mock.calls.map(([sql]) => sql);
    expect(sqls.some((sql) => sql.includes("ledger_entries"))).toBe(false);
    expect(sqls.some((sql) => sql.startsWith("UPDATE customers"))).toBe(false);
  });

  it("refuses a sale that was voided meanwhile, without writing anything", async () => {
    givenSale({ invoice_number: "INV-11", status: "VOIDED", total_amount: "1", total_paid: "1", customer_id: null });

    await expect(repository.voidSale(COMMAND)).rejects.toBeInstanceOf(SaleVoidRefusedError);
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
