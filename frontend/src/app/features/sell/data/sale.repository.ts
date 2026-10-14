import { Injectable, inject } from "@angular/core";

import {
  DatabaseExecutor,
  DatabaseService,
} from "../../../core/database/database.service";
import { StoreRepository } from "../../stores/store.repository";
import {
  PricedLine,
  SaleTotals,
  computeTotals,
  requireStock,
  validateAgainstClient,
} from "../domain/sale-calculator";
import { fromScaled, toScaled } from "../domain/decimal";
import { SaleReceipt, SaleRequest } from "../models/sale.model";
import {
  SaleConflictError,
  SaleNotFoundError,
  SaleValidationError,
} from "../sell.errors";
import { SellCatalogRepository } from "./sell-catalog.repository";

export interface SaleContext {
  readonly storeId: string;
  readonly userId: string;
}

const DEFAULT_CURRENCY = "PKR";

/** Write side of the sell screen. Every sale mutation runs in a single local transaction. */
@Injectable({ providedIn: "root" })
export class SaleRepository {
  private readonly database = inject(DatabaseService);
  private readonly catalog = inject(SellCatalogRepository);
  private readonly stores = inject(StoreRepository);

  /** Creates/replaces a draft or completes a sale (use cases 5 and 5a). */
  submit(request: SaleRequest, context: SaleContext): Promise<SaleReceipt> {
    return this.database.writeTransaction((tx) =>
      this.submitInTransaction(tx, request, context),
    );
  }

  /** The backend has no hard delete, so a discarded draft is voided (use case 5b). */
  async discardDraft(
    saleId: string,
    context: SaleContext,
    reason = "Draft discarded",
  ): Promise<void> {
    await this.database.writeTransaction(async (tx) => {
      const sale = await tx.getOptional<{ status: string }>(
        "SELECT status FROM sales WHERE id = ? AND store_id = ?",
        [saleId, context.storeId],
      );
      if (!sale) {
        throw new SaleNotFoundError("Pending bill was not found.");
      }
      if (sale.status !== "IN_PROGRESS") {
        throw new SaleConflictError("Only pending bills can be discarded.");
      }
      const now = new Date().toISOString();
      await tx.execute(
        `UPDATE sales SET status = 'VOIDED', void_reason = ?, voided_at = ?,
         voided_by = ?, last_updated = ? WHERE id = ?`,
        [reason, now, context.userId, now, saleId],
      );
    });
  }

  private async submitInTransaction(
    tx: DatabaseExecutor,
    request: SaleRequest,
    context: SaleContext,
  ): Promise<SaleReceipt> {
    const completing = request.saleStatus === "COMPLETED";
    const now = new Date().toISOString();

    if (request.saleId) {
      const existing = await tx.getOptional<{ status: string }>(
        "SELECT status FROM sales WHERE id = ? AND store_id = ?",
        [request.saleId, context.storeId],
      );
      if (!existing) {
        throw new SaleNotFoundError("Pending bill was not found.");
      }
      if (existing.status !== "IN_PROGRESS") {
        throw new SaleConflictError(
          "Only pending bills can be edited or finalised.",
        );
      }
    }

    const customer = await this.loadCustomer(tx, request, context);
    const products = await this.catalog.findProductsByIds(
      tx,
      request.saleItems.map((item) => item.productId),
      context.storeId,
    );
    const byId = new Map(products.map((product) => [product.id, product]));
    for (const item of request.saleItems) {
      const product = byId.get(item.productId);
      if (!product) {
        throw new SaleNotFoundError(`Product ${item.productId} was not found.`);
      }
      const row = await tx.get<{ status: string }>(
        "SELECT status FROM products WHERE id = ?",
        [product.id],
      );
      if (row.status !== "ACTIVE") {
        throw new SaleValidationError(
          `Product '${product.name}' is not active.`,
        );
      }
    }

    const totals = computeTotals(request, byId);
    validateAgainstClient(request, totals, completing);
    if (completing) {
      requireStock(totals.lines);
    }

    const saleId = request.saleId ?? globalThis.crypto.randomUUID();
    const invoiceNumber = completing
      ? await this.nextInvoiceNumber(tx, context.storeId, now)
      : await this.draftInvoiceNumber(tx, request.saleId);
    const paid = toScaled(totals.paid, 2);
    const remaining = toScaled(totals.total, 2) - paid;

    await this.writeSale(tx, {
      saleId,
      request,
      totals,
      invoiceNumber,
      remaining: fromScaled(remaining, 2),
      now,
      context,
    });
    await this.writeItems(tx, saleId, totals.lines, now, completing, {
      invoiceNumber,
      storeId: context.storeId,
    });
    await this.writePayments(tx, saleId, request, now);

    if (completing && customer) {
      await this.writeLedger(tx, {
        saleId,
        customerId: customer.id,
        invoiceNumber,
        totals,
        request,
        remaining,
        balance: customer.account_balance ?? "0",
        now,
      });
    }
    if (completing) {
      await tx.execute("INSERT INTO receipt_commits (sale_id) VALUES (?)", [
        saleId,
      ]);
    }

    return {
      id: saleId,
      invoiceNumber,
      status: completing ? "COMPLETED" : "IN_PROGRESS",
      totalAmount: totals.total,
      totalPaid: totals.paid,
      remaining: fromScaled(remaining, 2),
    };
  }

  private async loadCustomer(
    tx: DatabaseExecutor,
    request: SaleRequest,
    context: SaleContext,
  ): Promise<{ id: string; account_balance: string | null } | null> {
    if (!request.customerId) {
      return null;
    }
    const customer = await tx.getOptional<{
      id: string;
      status: string;
      account_balance: string | null;
    }>(
      "SELECT id, status, account_balance FROM customers WHERE id = ? AND store_id = ?",
      [request.customerId, context.storeId],
    );
    if (!customer) {
      throw new SaleNotFoundError("Customer was not found.");
    }
    if (customer.status !== "ACTIVE") {
      throw new SaleValidationError("Customer is not active.");
    }
    return customer;
  }

  private async nextInvoiceNumber(
    tx: DatabaseExecutor,
    storeId: string,
    now: string,
  ): Promise<string> {
    const settings = await this.stores.findSettings(storeId, tx);
    if (!settings) {
      throw new SaleConflictError(
        "Store settings have not synced yet, so an invoice number cannot be issued.",
      );
    }
    const next = settings.nextInvoiceNumber;
    if (
      !Number.isInteger(next) ||
      !Number.isInteger(settings.invoiceNumberStart) ||
      settings.invoiceNumberStart < 1 ||
      next < settings.invoiceNumberStart ||
      next >= 2_147_483_647
    ) {
      throw new SaleConflictError(
        "Store invoice numbering is invalid or exhausted. Update the store settings before completing a sale.",
      );
    }
    await tx.execute(
      "UPDATE business_settings SET next_invoice_number = ?, last_updated = ? WHERE id = ?",
      [next + 1, now, settings.id],
    );
    return `${settings.invoicePrefix}${next}`;
  }

  private async draftInvoiceNumber(
    tx: DatabaseExecutor,
    saleId: string | null,
  ): Promise<string> {
    if (saleId) {
      const existing = await tx.getOptional<{ invoice_number: string }>(
        "SELECT invoice_number FROM sales WHERE id = ?",
        [saleId],
      );
      if (existing?.invoice_number.startsWith("DRAFT-")) {
        return existing.invoice_number;
      }
    }
    return `DRAFT-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async writeSale(
    tx: DatabaseExecutor,
    input: {
      saleId: string;
      request: SaleRequest;
      totals: SaleTotals;
      invoiceNumber: string;
      remaining: string;
      now: string;
      context: SaleContext;
    },
  ): Promise<void> {
    const { saleId, request, totals, invoiceNumber, remaining, now, context } =
      input;
    const status = request.saleStatus;
    if (request.saleId) {
      await tx.execute("DELETE FROM sale_items WHERE sale_id = ?", [saleId]);
      await tx.execute("DELETE FROM payments WHERE sale_id = ?", [saleId]);
      await tx.execute(
        `UPDATE sales SET invoice_number = ?, sale_type = ?, subtotal = ?, discount_amount = ?,
           taxable_amount = ?, tax_amount = ?, total_amount = ?, sold_at = ?, status = ?,
           total_paid = ?, remaining = ?, description = ?, customer_id = ?, user_id = ?,
           last_updated = ? WHERE id = ?`,
        [
          invoiceNumber,
          request.saleType,
          totals.subtotal,
          totals.discount,
          totals.taxable,
          totals.tax,
          totals.total,
          now,
          status,
          totals.paid,
          remaining,
          request.description,
          request.customerId,
          context.userId,
          now,
          saleId,
        ],
      );
      return;
    }
    await tx.execute(
      `INSERT INTO sales (id, invoice_number, sale_type, subtotal, discount_amount, taxable_amount,
         tax_amount, total_amount, currency_code, sold_at, status, total_paid, remaining, description,
         customer_id, user_id, store_id, date_created, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saleId,
        invoiceNumber,
        request.saleType,
        totals.subtotal,
        totals.discount,
        totals.taxable,
        totals.tax,
        totals.total,
        DEFAULT_CURRENCY,
        now,
        status,
        totals.paid,
        remaining,
        request.description,
        request.customerId,
        context.userId,
        context.storeId,
        now,
        now,
      ],
    );
  }

  private async writeItems(
    tx: DatabaseExecutor,
    saleId: string,
    lines: readonly PricedLine[],
    now: string,
    completing: boolean,
    stock: { invoiceNumber: string; storeId: string },
  ): Promise<void> {
    for (const line of lines) {
      const itemId = globalThis.crypto.randomUUID();
      await tx.execute(
        `INSERT INTO sale_items (id, product_name, sku, quantity, unit_price, tax_rate,
           taxable_amount, line_total, sale_id, product_id, date_created, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          line.product.name,
          line.product.sku,
          line.quantity,
          line.unitPrice,
          line.taxRate,
          line.taxable,
          line.lineTotal,
          saleId,
          line.product.id,
          now,
          now,
        ],
      );
      if (!completing) {
        continue;
      }
      const before = toScaled(line.product.stockQuantity, 2);
      const sold = toScaled(line.quantity, 2);
      const after = fromScaled(before - sold, 2);
      await tx.execute(
        `INSERT INTO stock_movements (id, type, quantity, quantity_before, quantity_after,
           description, product_id, sale_id, sale_item_id, store_id, date_created, last_updated)
         VALUES (?, 'SALE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          globalThis.crypto.randomUUID(),
          line.quantity,
          fromScaled(before, 2),
          after,
          `Sale ${stock.invoiceNumber}`,
          line.product.id,
          saleId,
          itemId,
          stock.storeId,
          now,
          now,
        ],
      );
      await tx.execute(
        "UPDATE products SET stock_quantity = ?, last_updated = ? WHERE id = ?",
        [after, now, line.product.id],
      );
    }
  }

  private async writePayments(
    tx: DatabaseExecutor,
    saleId: string,
    request: SaleRequest,
    now: string,
  ): Promise<void> {
    for (const payment of request.payments) {
      await tx.execute(
        `INSERT INTO payments (id, amount, method, reference_number, description, sale_id,
           date_created, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          globalThis.crypto.randomUUID(),
          fromScaled(toScaled(payment.amount, 2), 2),
          payment.method,
          payment.referenceNumber,
          payment.description,
          saleId,
          now,
          now,
        ],
      );
    }
  }

  private async writeLedger(
    tx: DatabaseExecutor,
    input: {
      saleId: string;
      customerId: string;
      invoiceNumber: string;
      totals: SaleTotals;
      request: SaleRequest;
      remaining: bigint;
      balance: string;
      now: string;
    },
  ): Promise<void> {
    const { saleId, customerId, invoiceNumber, totals, request, now } = input;
    const insert = (
      direction: string,
      amount: string,
      type: string,
      description: string | null,
    ) =>
      tx.execute(
        `INSERT INTO ledger_entries (id, direction, amount, type, reference_number, description,
           voided, customer_id, sale_id, date_created, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [
          globalThis.crypto.randomUUID(),
          direction,
          amount,
          type,
          invoiceNumber,
          description,
          customerId,
          saleId,
          now,
          now,
        ],
      );

    await insert(
      "DEBIT",
      totals.total,
      "SALE",
      `Sale ${invoiceNumber}`,
    );
    for (const payment of request.payments) {
      await insert(
        "CREDIT",
        fromScaled(toScaled(payment.amount, 2), 2),
        "PAYMENT",
        payment.description ?? `Payment for sale ${invoiceNumber}`,
      );
    }
    const balance = toScaled(input.balance, 2) + input.remaining;
    await tx.execute(
      "UPDATE customers SET account_balance = ?, last_updated = ? WHERE id = ?",
      [fromScaled(balance, 2), now, customerId],
    );
  }
}
