import { Injectable, inject } from "@angular/core";
import { SqliteRecord } from "@powersync/common";

import {
  DatabaseExecutor,
  DatabaseService,
} from "../../../core/database/database.service";
import { fromScaled, toScaled } from "../../sell/domain/decimal";
import { SaleRegisterNotFoundError, SaleVoidRefusedError } from "../sales.errors";

export interface VoidSaleCommand {
  readonly saleId: string;
  readonly storeId: string;
  readonly userId: string;
  /** Already validated and trimmed. */
  readonly reason: string;
}

interface SaleRow extends SqliteRecord {
  readonly invoice_number: string;
  readonly status: string;
  readonly total_amount: string;
  readonly total_paid: string;
  readonly customer_id: string | null;
}

interface ItemRow extends SqliteRecord {
  readonly id: string;
  readonly product_id: string;
  readonly quantity: string;
  readonly stock_quantity: string | null;
}

/**
 * Voids a completed sale in one local transaction, mirroring SaleService#reverseSideEffects so the
 * synced rows are identical to a server-side void: stock is returned with ADJUSTMENT_IN movements,
 * the customer account is reversed with ADJUSTMENT ledger entries, and the sale is marked VOIDED.
 * Nothing is deleted or edited except the sale's one-way status change.
 */
@Injectable({ providedIn: "root" })
export class SaleVoidRepository {
  private readonly database = inject(DatabaseService);

  voidSale(command: VoidSaleCommand): Promise<void> {
    return this.database.writeTransaction(async (tx) => {
      const sale = await tx.getOptional<SaleRow>(
        `SELECT invoice_number, status, total_amount, total_paid, customer_id
         FROM sales WHERE id = ? AND store_id = ?`,
        [command.saleId, command.storeId],
      );
      if (!sale) {
        throw new SaleRegisterNotFoundError();
      }
      // Re-checked inside the transaction: another tab or a sync may have voided it meanwhile.
      if (sale.status === "VOIDED") {
        throw new SaleVoidRefusedError("This sale is already voided.");
      }
      if (sale.status !== "COMPLETED") {
        throw new SaleVoidRefusedError("Only completed sales can be voided.");
      }

      const now = new Date().toISOString();
      await this.returnStock(tx, command, sale.invoice_number, now);
      if (sale.customer_id) {
        await this.reverseCustomerAccount(tx, command, sale, sale.customer_id, now);
      }
      await tx.execute(
        `UPDATE sales SET status = 'VOIDED', void_reason = ?, voided_at = ?, voided_by = ?,
           last_updated = ? WHERE id = ?`,
        [command.reason, now, command.userId, now, command.saleId],
      );
    });
  }

  private async returnStock(
    tx: DatabaseExecutor,
    command: VoidSaleCommand,
    invoiceNumber: string,
    now: string,
  ): Promise<void> {
    const items = await tx.getAll<ItemRow>(
      `SELECT i.id, i.product_id, i.quantity, p.stock_quantity
       FROM sale_items i LEFT JOIN products p ON p.id = i.product_id
       WHERE i.sale_id = ? ORDER BY i.date_created, i.id`,
      [command.saleId],
    );
    // A product may appear once per sale, but track running stock per product to be safe.
    const stock = new Map<string, bigint>();
    for (const item of items) {
      const before =
        stock.get(item.product_id) ?? toScaled(item.stock_quantity ?? "0", 2);
      const quantity = toScaled(item.quantity, 2);
      const after = before + quantity;
      stock.set(item.product_id, after);
      await tx.execute(
        `INSERT INTO stock_movements (id, type, quantity, quantity_before, quantity_after,
           description, product_id, sale_id, sale_item_id, store_id, date_created, last_updated)
         VALUES (?, 'ADJUSTMENT_IN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          globalThis.crypto.randomUUID(),
          fromScaled(quantity, 2),
          fromScaled(before, 2),
          fromScaled(after, 2),
          `Void of sale ${invoiceNumber}: ${command.reason}`,
          item.product_id,
          command.saleId,
          item.id,
          command.storeId,
          now,
          now,
        ],
      );
      await tx.execute(
        "UPDATE products SET stock_quantity = ?, last_updated = ? WHERE id = ?",
        [fromScaled(after, 2), now, item.product_id],
      );
    }
  }

  private async reverseCustomerAccount(
    tx: DatabaseExecutor,
    command: VoidSaleCommand,
    sale: SaleRow,
    customerId: string,
    now: string,
  ): Promise<void> {
    const total = toScaled(sale.total_amount, 2);
    const paid = toScaled(sale.total_paid, 2);
    const insert = (direction: "DEBIT" | "CREDIT", amount: bigint, description: string) =>
      tx.execute(
        `INSERT INTO ledger_entries (id, direction, amount, type, reference_number, description,
           voided, customer_id, sale_id, date_created, last_updated)
         VALUES (?, ?, ?, 'ADJUSTMENT', ?, ?, 0, ?, ?, ?, ?)`,
        [
          globalThis.crypto.randomUUID(),
          direction,
          fromScaled(amount, 2),
          sale.invoice_number,
          description,
          customerId,
          command.saleId,
          now,
          now,
        ],
      );

    await insert(
      "CREDIT",
      total,
      `Reversal of SALE debit for voided sale ${sale.invoice_number}: ${command.reason}`,
    );
    if (paid > 0n) {
      await insert(
        "DEBIT",
        paid,
        `Reversal of PAYMENT credit(s) for voided sale ${sale.invoice_number}: ${command.reason}`,
      );
    }
    const customer = await tx.getOptional<{ account_balance: string | null }>(
      "SELECT account_balance FROM customers WHERE id = ?",
      [customerId],
    );
    if (customer) {
      const balance = toScaled(customer.account_balance ?? "0", 2) - (total - paid);
      await tx.execute(
        "UPDATE customers SET account_balance = ?, last_updated = ? WHERE id = ?",
        [fromScaled(balance, 2), now, customerId],
      );
    }
  }
}
