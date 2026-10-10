import { SqliteValue } from "@powersync/common";
import { Injectable, inject } from "@angular/core";
import { Observable, map } from "rxjs";

import {
  DatabaseExecutor,
  DatabaseService,
} from "../../../core/database/database.service";
import { DraftSale } from "../models/sale.model";
import { PendingBill, SellCustomer, SellProduct } from "../models/sell.model";

interface ProductRow {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly unit_price: string;
  readonly stock_quantity: string | null;
  readonly allows_fraction: number | null;
  readonly unit_name: string | null;
  readonly tax_rate: number | string | null;
  [key: string]: SqliteValue;
}

interface CustomerRow {
  readonly id: string;
  readonly name: string;
  readonly phone_number: string | null;
  readonly account_balance: string | null;
  [key: string]: SqliteValue;
}

interface DraftRow {
  readonly id: string;
  readonly customer_id: string | null;
  readonly discount_amount: string | null;
  [key: string]: SqliteValue;
}

// Sums every linked tax category rate, exactly like the backend's SaleCalculator.
const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.sku, p.barcode, p.unit_price, p.stock_quantity,
         u.allows_fraction AS allows_fraction, u.name AS unit_name,
         COALESCE((SELECT SUM(CAST(t.rate AS REAL))
                   FROM product_tax_categories ptc
                   JOIN tax_categories t ON t.id = ptc.tax_category_id
                   WHERE ptc.product_id = p.id), 0) AS tax_rate
  FROM products p
  JOIN units_of_measures u ON u.id = p.units_of_measure_id`;

export function mapProduct(row: ProductRow): SellProduct {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    unitPrice: row.unit_price,
    stockQuantity: row.stock_quantity ?? "0",
    allowsFraction: Boolean(row.allows_fraction),
    unitName: row.unit_name ?? "",
    // tax_categories.rate is stored as a percent (18 = 18%); the calculator expects a fraction.
    taxRate: Number(row.tax_rate ?? 0) / 100,
  };
}

function mapCustomer(row: CustomerRow): SellCustomer {
  return {
    id: row.id,
    name: row.name,
    phoneNumber: row.phone_number,
    accountBalance: row.account_balance ?? "0",
  };
}

/** Read side of the sell screen: sellable products/customers and pending drafts. */
@Injectable({ providedIn: "root" })
export class SellCatalogRepository {
  private readonly database = inject(DatabaseService);

  watchProducts(storeId: string): Observable<readonly SellProduct[]> {
    return this.database
      .watch(
        `${PRODUCT_SELECT} WHERE p.store_id = ? AND p.status = 'ACTIVE'
         ORDER BY p.name COLLATE NOCASE`,
        [storeId],
      )
      .pipe(map((rows) => (rows as readonly ProductRow[]).map(mapProduct)));
  }

  watchCustomers(storeId: string): Observable<readonly SellCustomer[]> {
    return this.database
      .watch(
        `SELECT id, name, phone_number, account_balance FROM customers
         WHERE store_id = ? AND status = 'ACTIVE' ORDER BY name COLLATE NOCASE`,
        [storeId],
      )
      .pipe(map((rows) => (rows as readonly CustomerRow[]).map(mapCustomer)));
  }

  watchPendingBills(storeId: string): Observable<readonly PendingBill[]> {
    return this.database
      .watch(
        `SELECT id FROM sales WHERE store_id = ? AND status = 'IN_PROGRESS'
         ORDER BY date_created, id`,
        [storeId],
      )
      .pipe(
        map((rows) =>
          (rows as readonly { id: string }[]).map((row, index) => ({
            id: row.id,
            label: `Order ${index + 1}`,
          })),
        ),
      );
  }

  async findDraft(id: string, storeId: string): Promise<DraftSale | null> {
    const sale = await this.database.getOptional<DraftRow>(
      `SELECT id, customer_id, discount_amount FROM sales
       WHERE id = ? AND store_id = ? AND status = 'IN_PROGRESS'`,
      [id, storeId],
    );
    if (!sale) {
      return null;
    }
    const items = await this.database.getAll<{
      product_id: string;
      quantity: string;
    }>(
      `SELECT product_id, quantity FROM sale_items WHERE sale_id = ?
       ORDER BY date_created, id`,
      [id],
    );
    return {
      id: sale.id,
      customerId: sale.customer_id,
      discount: sale.discount_amount ?? "0",
      items: items.map((item) => ({
        productId: item.product_id,
        quantity: item.quantity,
      })),
    };
  }

  findProductsByIds(
    executor: Pick<DatabaseExecutor, "getAll">,
    ids: readonly string[],
    storeId: string,
  ): Promise<readonly SellProduct[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    const placeholders = ids.map(() => "?").join(", ");
    return executor
      .getAll<ProductRow>(
        `${PRODUCT_SELECT} WHERE p.store_id = ? AND p.id IN (${placeholders})`,
        [storeId, ...ids],
      )
      .then((rows) => rows.map(mapProduct));
  }

  findProducts(
    ids: readonly string[],
    storeId: string,
  ): Promise<readonly SellProduct[]> {
    return this.findProductsByIds(this.database, ids, storeId);
  }
}
