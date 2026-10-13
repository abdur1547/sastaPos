import { Injectable, inject } from "@angular/core";
import { SqliteRecord } from "@powersync/common";
import { Observable, combineLatest, map } from "rxjs";

import { DatabaseService } from "../../../core/database/database.service";
import {
  SaleDetail,
  SaleDetailHeader,
  SaleDetailItem,
  SaleDetailPayment,
  SaleLedgerEntry,
  SaleStockMovement,
} from "../models/sale-detail.model";
import {
  nullableDate,
  nullableText,
  oneOf,
  requiredDate,
  requiredDecimal,
  requiredMoney,
  requiredText,
} from "./sale-row.mapper";

/** Loads one sale as a document: header, lines, payments and every row it caused elsewhere. */
@Injectable({ providedIn: "root" })
export class SaleDetailRepository {
  private readonly database = inject(DatabaseService);

  /** Emits null when the sale is not in the store; re-emits when it (or its audit trail) changes. */
  watchDetail(id: string, storeId: string): Observable<SaleDetail | null> {
    return combineLatest([
      this.database.watch(
        `SELECT s.id, s.invoice_number, s.status, s.sale_type, s.sold_at, s.currency_code, s.subtotal,
           s.discount_amount, s.tax_amount, s.total_amount, s.total_paid, s.remaining, s.description,
           s.void_reason, s.voided_at, s.user_id, s.customer_id,
           c.name AS customer_name, c.phone_number AS customer_phone,
           u.name AS cashier_name, vb.name AS voided_by_name
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN users vb ON vb.id = s.voided_by
         WHERE s.id = ? AND s.store_id = ?`,
        [id, storeId],
      ),
      this.database.watch(
        `SELECT id, product_id, product_name, sku, quantity, unit_price, tax_rate, line_total
         FROM sale_items WHERE sale_id = ? ORDER BY date_created, id`,
        [id],
      ),
      this.database.watch(
        `SELECT id, amount, method, reference_number, description, date_created
         FROM payments WHERE sale_id = ? ORDER BY date_created, id`,
        [id],
      ),
      this.database.watch(
        `SELECT m.id, m.type, m.quantity, m.quantity_before, m.quantity_after, m.description,
           m.date_created, p.name AS product_name
         FROM stock_movements m LEFT JOIN products p ON p.id = m.product_id
         WHERE m.sale_id = ? AND m.store_id = ? ORDER BY m.date_created, m.id`,
        [id, storeId],
      ),
      this.database.watch(
        `SELECT id, direction, type, amount, description, date_created
         FROM ledger_entries WHERE sale_id = ? ORDER BY date_created, id`,
        [id],
      ),
    ]).pipe(
      map(([headers, items, payments, movements, entries]) =>
        headers.length === 0
          ? null
          : {
              header: toHeader(headers[0]),
              items: items.map(toItem),
              payments: payments.map(toPayment),
              stockMovements: movements.map(toMovement),
              ledgerEntries: entries.map(toLedgerEntry),
            },
      ),
    );
  }
}

function toHeader(row: SqliteRecord): SaleDetailHeader {
  const customerId = nullableText(row["customer_id"], "customer_id");
  const status = oneOf(row["status"], ["IN_PROGRESS", "COMPLETED", "VOIDED"], "status");
  return {
    id: requiredText(row["id"], "id"),
    invoiceNumber: requiredText(row["invoice_number"], "invoice_number"),
    status,
    saleType: oneOf(row["sale_type"], ["DEBIT", "CREDIT"], "sale_type"),
    soldAt: requiredDate(row["sold_at"], "sold_at"),
    currencyCode: nullableText(row["currency_code"], "currency_code") ?? "PKR",
    subtotal: requiredMoney(row["subtotal"], "subtotal"),
    discountAmount: requiredMoney(row["discount_amount"], "discount_amount"),
    taxAmount: requiredMoney(row["tax_amount"], "tax_amount"),
    totalAmount: requiredMoney(row["total_amount"], "total_amount"),
    totalPaid: requiredMoney(row["total_paid"], "total_paid"),
    remaining: requiredMoney(row["remaining"], "remaining"),
    description: nullableText(row["description"], "description"),
    customer: customerId
      ? {
          id: customerId,
          name: nullableText(row["customer_name"], "customer_name") ?? "Unknown customer",
          phoneNumber: nullableText(row["customer_phone"], "customer_phone"),
        }
      : null,
    cashier: {
      id: requiredText(row["user_id"], "user_id"),
      name: nullableText(row["cashier_name"], "cashier_name"),
    },
    voided:
      status === "VOIDED"
        ? {
            reason: nullableText(row["void_reason"], "void_reason") ?? "No reason recorded",
            at: nullableDate(row["voided_at"]),
            byName: nullableText(row["voided_by_name"], "voided_by_name"),
          }
        : null,
  };
}

function toItem(row: SqliteRecord): SaleDetailItem {
  return {
    id: requiredText(row["id"], "sale_items.id"),
    productId: requiredText(row["product_id"], "sale_items.product_id"),
    productName: requiredText(row["product_name"], "sale_items.product_name"),
    sku: nullableText(row["sku"], "sale_items.sku"),
    quantity: requiredDecimal(row["quantity"], "sale_items.quantity"),
    unitPrice: requiredMoney(row["unit_price"], "sale_items.unit_price"),
    taxRate: requiredDecimal(row["tax_rate"], "sale_items.tax_rate"),
    lineTotal: requiredMoney(row["line_total"], "sale_items.line_total"),
  };
}

function toPayment(row: SqliteRecord): SaleDetailPayment {
  return {
    id: requiredText(row["id"], "payments.id"),
    amount: requiredMoney(row["amount"], "payments.amount"),
    method: oneOf(row["method"], ["CASH", "BANK", "CREDIT"], "payments.method"),
    referenceNumber: nullableText(row["reference_number"], "payments.reference_number"),
    description: nullableText(row["description"], "payments.description"),
    createdAt: nullableDate(row["date_created"]),
  };
}

function toMovement(row: SqliteRecord): SaleStockMovement {
  return {
    id: requiredText(row["id"], "stock_movements.id"),
    type: requiredText(row["type"], "stock_movements.type"),
    productName: nullableText(row["product_name"], "products.name"),
    quantity: requiredDecimal(row["quantity"], "stock_movements.quantity"),
    quantityBefore: requiredDecimal(row["quantity_before"], "stock_movements.quantity_before"),
    quantityAfter: requiredDecimal(row["quantity_after"], "stock_movements.quantity_after"),
    description: nullableText(row["description"], "stock_movements.description"),
    createdAt: nullableDate(row["date_created"]),
  };
}

function toLedgerEntry(row: SqliteRecord): SaleLedgerEntry {
  return {
    id: requiredText(row["id"], "ledger_entries.id"),
    direction: oneOf(row["direction"], ["DEBIT", "CREDIT"], "ledger_entries.direction"),
    type: requiredText(row["type"], "ledger_entries.type"),
    amount: requiredMoney(row["amount"], "ledger_entries.amount"),
    description: nullableText(row["description"], "ledger_entries.description"),
    createdAt: nullableDate(row["date_created"]),
  };
}
