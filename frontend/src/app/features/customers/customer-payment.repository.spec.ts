import { TestBed } from "@angular/core/testing";

import {
  DatabaseExecutor,
  DatabaseService,
} from "../../core/database/database.service";
import { CustomerPaymentRecord } from "./customer-payment.model";
import { CustomerPaymentRepository } from "./customer-payment.repository";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("CustomerPaymentRepository", () => {
  const payment: CustomerPaymentRecord = {
    id: "payment",
    customerId: "customer",
    storeId: "store",
    userId: "cashier",
    amount: "400.25",
    method: "BANK",
    referenceNumber: "TRX-1",
    description: "Settlement",
    allowCredit: false,
    createdAt: "2026-10-22T10:00:00Z",
  };
  const execute = jest.fn();
  const getOptional = jest.fn();
  const writeTransaction = jest.fn();
  let repository: CustomerPaymentRepository;

  beforeEach(() => {
    execute.mockReset().mockResolvedValue({ rows: [], rowsAffected: 1 });
    getOptional.mockReset().mockResolvedValue({ account_balance: "1000.00" });
    writeTransaction
      .mockReset()
      .mockImplementation(
        (operation: (tx: DatabaseExecutor) => Promise<string>) =>
          operation({
            execute,
            getOptional,
            get: jest.fn(),
            getAll: jest.fn(),
          }),
      );
    TestBed.configureTestingModule({
      providers: [{ provide: DatabaseService, useValue: { writeTransaction } }],
    });
    repository = TestBed.inject(CustomerPaymentRepository);
  });

  it("writes an incoming payment, linked credit and updated balance in one native transaction", async () => {
    await expect(repository.takePayment(payment)).resolves.toBe("599.75");
    expect(writeTransaction).toHaveBeenCalledTimes(1);
    expect(getOptional).toHaveBeenCalledWith(
      expect.stringContaining("store_id = ?"),
      ["customer", "store"],
    );
    expect(execute).toHaveBeenCalledTimes(3);
    const [paymentSql, paymentParams] = execute.mock.calls[0];
    expect(paymentSql).toContain("'INCOMING'");
    expect(paymentSql).toContain("NULL");
    expect(paymentParams).toEqual([
      "payment",
      "400.25",
      "BANK",
      "TRX-1",
      "Settlement",
      "customer",
      "store",
      "cashier",
      payment.createdAt,
      payment.createdAt,
    ]);
    const [ledgerSql, ledgerParams] = execute.mock.calls[1];
    expect(ledgerSql).toContain("'CREDIT'");
    expect(ledgerSql).toContain("'PAYMENT'");
    expect(ledgerParams).toEqual([
      "payment",
      "400.25",
      "TRX-1",
      "Settlement",
      "customer",
      "payment",
      "store",
      "cashier",
      payment.createdAt,
      payment.createdAt,
    ]);
    expect(execute.mock.calls[2][1]).toEqual([
      "599.75",
      payment.createdAt,
      "customer",
      "store",
    ]);
    for (const [sql, parameters] of execute.mock.calls) {
      expect(sql.match(/\?/g)).toHaveLength(parameters.length);
    }
  });

  it("allows a confirmed overpayment after re-reading the latest local balance", async () => {
    getOptional.mockResolvedValue({ account_balance: "100.00" });
    await expect(
      repository.takePayment({ ...payment, allowCredit: true }),
    ).resolves.toBe("-300.25");
  });

  it.each([
    [null, "was not found"],
    [{ account_balance: "100.00" }, "Confirm"],
    [{ account_balance: "-9999999999999999.99" }, "out of range"],
  ])(
    "rejects missing customers, unconfirmed credit and overflow before writing",
    async (row, message) => {
      getOptional.mockResolvedValue(row);
      await expect(repository.takePayment(payment)).rejects.toThrow(
        String(message),
      );
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("propagates a ledger write failure to the transaction owner and does not update the balance", async () => {
    execute
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("Disk full"));
    await expect(repository.takePayment(payment)).rejects.toThrow("Disk full");
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
