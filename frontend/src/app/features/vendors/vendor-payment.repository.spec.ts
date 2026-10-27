import { TestBed } from "@angular/core/testing";

import {
  DatabaseExecutor,
  DatabaseService,
} from "../../core/database/database.service";
import { VendorPaymentRecord } from "./vendor-payment.model";
import { VendorPaymentRepository } from "./vendor-payment.repository";
import { VendorValidationError } from "./vendor.errors";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("VendorPaymentRepository", () => {
  const outgoingPayment: VendorPaymentRecord = {
    id: "pay-1",
    vendorId: "v-1",
    storeId: "store-1",
    userId: "user-1",
    direction: "OUTGOING",
    amount: "400.00",
    method: "BANK",
    referenceNumber: "TRX-101",
    description: "Partial settlement",
    allowZeroCross: false,
    createdAt: "2026-10-27T10:00:00Z",
  };

  const execute = jest.fn();
  const getOptional = jest.fn();
  const writeTransaction = jest.fn();
  let repository: VendorPaymentRepository;

  beforeEach(() => {
    execute.mockReset().mockResolvedValue({ rows: [], rowsAffected: 1 });
    getOptional.mockReset().mockResolvedValue({ account_balance: "-1000.00" }); // Store owes vendor 1000
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
    repository = TestBed.inject(VendorPaymentRepository);
  });

  describe("takePayment", () => {
    it("writes an outgoing payment, linked DEBIT ledger entry and increases balance towards zero", async () => {
      // Balance was -1000.00. We pay 400.00 (OUTGOING). Result: -600.00.
      await expect(repository.takePayment(outgoingPayment)).resolves.toBe("-600.00");
      expect(writeTransaction).toHaveBeenCalledTimes(1);

      expect(execute).toHaveBeenCalledTimes(3);

      // 1. payments table
      const [paymentSql, paymentParams] = execute.mock.calls[0];
      expect(paymentSql).toContain("INSERT INTO payments");
      expect(paymentParams[1]).toBe("OUTGOING");
      expect(paymentParams[2]).toBe("400.00");
      expect(paymentParams[6]).toBe("v-1"); // vendor_id

      // 2. ledger_entries table
      const [ledgerSql, ledgerParams] = execute.mock.calls[1];
      expect(ledgerSql).toContain("INSERT INTO ledger_entries");
      expect(ledgerSql).toContain("'PAYMENT'");
      expect(ledgerParams[0]).toBe("pay-1");
      expect(ledgerParams[1]).toBe("DEBIT"); // OUTGOING payment creates DEBIT ledger entry
      expect(ledgerParams[2]).toBe("400.00");
      expect(ledgerParams[3]).toBe("TRX-101");
      expect(ledgerParams[5]).toBe("v-1"); // vendor_id
      expect(ledgerParams[6]).toBe("pay-1"); // payment_id

      // 3. vendors table balance update
      const [vendorSql, vendorParams] = execute.mock.calls[2];
      expect(vendorSql).toContain("UPDATE vendors SET account_balance = ?");
      expect(vendorParams[0]).toBe("-600.00");
    });

    it("rejects payments that cross zero when allowZeroCross is false", async () => {
      // Balance is -1000.00. Payment is 1500.00 -> Result would be +500.00 (advance).
      const crossingPayment: VendorPaymentRecord = {
        ...outgoingPayment,
        amount: "1500.00",
        allowZeroCross: false,
      };

      await expect(repository.takePayment(crossingPayment)).rejects.toThrow(
        VendorValidationError,
      );
    });

    it("allows payments that cross zero when allowZeroCross is true", async () => {
      const crossingPayment: VendorPaymentRecord = {
        ...outgoingPayment,
        amount: "1500.00",
        allowZeroCross: true,
      };

      await expect(repository.takePayment(crossingPayment)).resolves.toBe("500.00");
    });

    it("writes an incoming payment (refund), linked CREDIT ledger entry and decreases balance", async () => {
      getOptional.mockResolvedValueOnce({ account_balance: "500.00" }); // Vendor owes store 500 (advance)

      const incomingPayment: VendorPaymentRecord = {
        ...outgoingPayment,
        direction: "INCOMING",
        amount: "500.00",
      };

      await expect(repository.takePayment(incomingPayment)).resolves.toBe("0.00");
      const [, ledgerParams] = execute.mock.calls[1];
      expect(ledgerParams[1]).toBe("CREDIT"); // INCOMING payment creates CREDIT ledger entry
    });
  });

  describe("voidPayment", () => {
    it("voids payment and ledger entry, appends reversing ADJUSTMENT entry and restores balance", async () => {
      // Payment was OUTGOING 400.00 (DEBIT). It had changed balance from -1000 to -600.
      // Voiding it will reverse by CREDIT 400.00, changing balance back to -1000.00.
      getOptional
        .mockResolvedValueOnce({ id: "pay-1", voided: 0, vendor_id: "v-1" }) // paymentRow
        .mockResolvedValueOnce({
          id: "entry-1",
          direction: "DEBIT",
          amount: "400.00",
          reference_number: "TRX-101",
        }) // originalEntry
        .mockResolvedValueOnce({ account_balance: "-600.00" }); // vendorRow

      const newBalance = await repository.voidPayment(
        "store-1",
        "user-1",
        "pay-1",
        "v-1",
        "Entered wrong amount by mistake",
      );

      expect(newBalance).toBe("-1000.00");
      expect(execute).toHaveBeenCalledTimes(4);

      // 1. UPDATE payments voided
      expect(execute.mock.calls[0][0]).toContain("UPDATE payments SET voided = 1");
      // 2. UPDATE ledger_entries voided
      expect(execute.mock.calls[1][0]).toContain("UPDATE ledger_entries SET voided = 1");
      // 3. INSERT reversing ADJUSTMENT entry
      const [reversalSql, reversalParams] = execute.mock.calls[2];
      expect(reversalSql).toContain("INSERT INTO ledger_entries");
      expect(reversalSql).toContain("'ADJUSTMENT'");
      expect(reversalParams[1]).toBe("CREDIT"); // reversing of DEBIT is CREDIT
      expect(reversalParams[2]).toBe("400.00");
      expect(reversalParams[3]).toBe("TRX-101");
      expect(reversalParams[5]).toBe("v-1"); // vendor_id
      expect(reversalParams[6]).toBe("entry-1"); // reversal_of_entry_id
      expect(reversalParams[7]).toBe("pay-1"); // payment_id
      // 4. UPDATE vendors account_balance
      expect(execute.mock.calls[3][1][0]).toBe("-1000.00");
    });
  });
});
