import { Injectable, inject } from "@angular/core";
import { SqliteRecord } from "@powersync/common";

import { DatabaseService } from "../../core/database/database.service";
import { fromScaled, toScaled } from "../../shared/utils/decimal";
import {
  VendorNotFoundError,
  VendorPersistenceError,
  VendorValidationError,
} from "./vendor.errors";
import {
  balanceAfterVendorPayment,
  doesPaymentCrossZero,
  VendorPaymentRecord,
} from "./vendor-payment.model";

@Injectable({ providedIn: "root" })
export class VendorPaymentRepository {
  private readonly database = inject(DatabaseService);

  takePayment(payment: VendorPaymentRecord): Promise<string> {
    return this.database.writeTransaction(async (tx) => {
      const vendor = await tx.getOptional<{ account_balance: string }>(
        "SELECT account_balance FROM vendors WHERE id = ? AND store_id = ?",
        [payment.vendorId, payment.storeId],
      );
      if (!vendor) throw new VendorNotFoundError(payment.vendorId);

      const balance = balanceAfterVendorPayment(
        vendor.account_balance,
        payment.amount,
        payment.direction,
      );

      if (
        doesPaymentCrossZero(vendor.account_balance, balance) &&
        !payment.allowZeroCross
      ) {
        throw new VendorValidationError(
          "Confirm the vendor's resulting balance before recording this payment.",
        );
      }

      const {
        id,
        direction,
        amount,
        method,
        referenceNumber,
        description,
        vendorId,
        storeId,
        userId,
        createdAt,
      } = payment;

      // Standalone payment write
      await tx.execute(
        `INSERT INTO payments
         (id, direction, amount, method, reference_number, description, voided,
          sale_id, customer_id, vendor_id, store_id, user_id, date_created, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?, ?, ?, ?)`,
        [
          id,
          direction,
          amount,
          method,
          referenceNumber,
          description,
          vendorId,
          storeId,
          userId,
          createdAt,
          createdAt,
        ],
      );

      // INCOMING payment creates CREDIT ledger entry; OUTGOING payment creates DEBIT ledger entry
      const ledgerDirection = direction === "INCOMING" ? "CREDIT" : "DEBIT";

      await tx.execute(
        `INSERT INTO ledger_entries
         (id, direction, amount, type, reference_number, description, voided,
          customer_id, vendor_id, reversal_of_entry_id, sale_id, payment_id,
          store_id, user_id, date_created, last_updated)
         VALUES (?, ?, ?, 'PAYMENT', ?, ?, 0, NULL, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
        [
          id,
          ledgerDirection,
          amount,
          referenceNumber,
          description,
          vendorId,
          id,
          storeId,
          userId,
          createdAt,
          createdAt,
        ],
      );

      await tx.execute(
        "UPDATE vendors SET account_balance = ?, last_updated = ? WHERE id = ? AND store_id = ?",
        [balance, createdAt, vendorId, storeId],
      );

      return balance;
    });
  }

  voidPayment(
    storeId: string,
    userId: string,
    paymentId: string,
    vendorId: string,
    voidReason: string,
  ): Promise<string> {
    const trimmedReason = voidReason.trim();
    if (!trimmedReason) {
      throw new VendorValidationError("A void reason is required.");
    }

    return this.database.writeTransaction(async (tx) => {
      const paymentRow = await tx.getOptional<SqliteRecord>(
        "SELECT * FROM payments WHERE id = ? AND vendor_id = ? AND store_id = ?",
        [paymentId, vendorId, storeId],
      );
      if (!paymentRow) {
        throw new VendorNotFoundError(paymentId);
      }
      if (Number(paymentRow["voided"] ?? 0) === 1) {
        throw new VendorValidationError("This payment is already voided.");
      }

      const originalEntry = await tx.getOptional<SqliteRecord>(
        "SELECT * FROM ledger_entries WHERE payment_id = ? AND type = 'PAYMENT'",
        [paymentId],
      );
      if (!originalEntry) {
        throw new VendorPersistenceError(
          "Linked PAYMENT ledger entry was not found.",
        );
      }

      const vendorRow = await tx.getOptional<{ account_balance: string }>(
        "SELECT account_balance FROM vendors WHERE id = ? AND store_id = ?",
        [vendorId, storeId],
      );
      if (!vendorRow) {
        throw new VendorNotFoundError(vendorId);
      }

      const originalDirection = String(originalEntry["direction"]);
      const originalAmount = String(originalEntry["amount"]);
      const reversalDirection =
        originalDirection === "DEBIT" ? "CREDIT" : "DEBIT";

      // Apply reversal to balance: DEBIT adds, CREDIT subtracts
      const currentScaled = toScaled(vendorRow.account_balance, 2);
      const deltaScaled = toScaled(originalAmount, 2);
      const newScaled =
        reversalDirection === "DEBIT"
          ? currentScaled + deltaScaled
          : currentScaled - deltaScaled;
      const newBalance = fromScaled(newScaled, 2);

      const now = new Date().toISOString();

      // 1. Mark original payment voided
      await tx.execute(
        "UPDATE payments SET voided = 1, void_reason = ?, voided_at = ?, voided_by = ?, last_updated = ? WHERE id = ?",
        [trimmedReason, now, userId, now, paymentId],
      );

      // 2. Mark original ledger entry voided
      await tx.execute(
        "UPDATE ledger_entries SET voided = 1, void_reason = ?, voided_at = ?, voided_by = ?, last_updated = ? WHERE id = ?",
        [trimmedReason, now, userId, now, originalEntry["id"]],
      );

      // 3. Append reversing ADJUSTMENT ledger entry
      const reversalId = globalThis.crypto.randomUUID();
      await tx.execute(
        `INSERT INTO ledger_entries
         (id, direction, amount, type, reference_number, description, voided,
          customer_id, vendor_id, reversal_of_entry_id, sale_id, payment_id,
          store_id, user_id, date_created, last_updated)
         VALUES (?, ?, ?, 'ADJUSTMENT', ?, ?, 0, NULL, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        [
          reversalId,
          reversalDirection,
          originalAmount,
          originalEntry["reference_number"] ?? null,
          `Void: ${trimmedReason}`,
          vendorId,
          originalEntry["id"],
          paymentId,
          storeId,
          userId,
          now,
          now,
        ],
      );

      // 4. Update vendor account balance
      await tx.execute(
        "UPDATE vendors SET account_balance = ?, last_updated = ? WHERE id = ? AND store_id = ?",
        [newBalance, now, vendorId, storeId],
      );

      return newBalance;
    });
  }
}

