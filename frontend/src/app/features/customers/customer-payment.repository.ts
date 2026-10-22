import { Injectable, inject } from "@angular/core";

import { DatabaseService } from "../../core/database/database.service";
import {
  CustomerNotFoundError,
  CustomerValidationError,
} from "./customer.errors";
import {
  balanceAfterPayment,
  CustomerPaymentRecord,
} from "./customer-payment.model";

@Injectable({ providedIn: "root" })
export class CustomerPaymentRepository {
  private readonly database = inject(DatabaseService);

  takePayment(payment: CustomerPaymentRecord): Promise<string> {
    return this.database.writeTransaction(async (tx) => {
      const customer = await tx.getOptional<{ account_balance: string }>(
        "SELECT account_balance FROM customers WHERE id = ? AND store_id = ?",
        [payment.customerId, payment.storeId],
      );
      if (!customer) throw new CustomerNotFoundError(payment.customerId);
      const balance = balanceAfterPayment(
        customer.account_balance,
        payment.amount,
      );
      if (balance.startsWith("-") && !payment.allowCredit) {
        throw new CustomerValidationError(
          "Confirm the customer's resulting credit before recording this payment.",
        );
      }
      const {
        id,
        amount,
        method,
        referenceNumber,
        description,
        customerId,
        storeId,
        userId,
        createdAt,
      } = payment;
      await tx.execute(
        `INSERT INTO payments
         (id, direction, amount, method, reference_number, description, sale_id,
          customer_id, store_id, user_id, date_created, last_updated)
         VALUES (?, 'INCOMING', ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        [
          id,
          amount,
          method,
          referenceNumber,
          description,
          customerId,
          storeId,
          userId,
          createdAt,
          createdAt,
        ],
      );
      await tx.execute(
        `INSERT INTO ledger_entries
         (id, direction, amount, type, reference_number, description, voided,
          customer_id, sale_id, payment_id, store_id, user_id, date_created, last_updated)
         VALUES (?, 'CREDIT', ?, 'PAYMENT', ?, ?, 0, ?, NULL, ?, ?, ?, ?, ?)`,
        [
          id,
          amount,
          referenceNumber,
          description,
          customerId,
          id,
          storeId,
          userId,
          createdAt,
          createdAt,
        ],
      );
      await tx.execute(
        "UPDATE customers SET account_balance = ?, last_updated = ? WHERE id = ? AND store_id = ?",
        [balance, createdAt, customerId, storeId],
      );
      return balance;
    });
  }
}
