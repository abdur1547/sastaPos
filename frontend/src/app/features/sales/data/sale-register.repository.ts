import { Injectable, inject } from "@angular/core";
import { SqliteRecord, SqliteValue } from "@powersync/common";
import { Observable, map } from "rxjs";

import { DatabaseService } from "../../../core/database/database.service";
import { divRound, fromScaled, toScaled } from "../../sell/domain/decimal";
import {
  CashierOption,
  PaymentMethod,
  SalePage,
  SalePageRequest,
  SaleListItem,
  SaleRegisterFilters,
  SaleRegisterSummary,
  SaleSort,
  SaleSortField,
  SoldAtRange,
} from "../models/sale-register.model";
import {
  likePattern,
  nullableText,
  oneOf,
  requiredDate,
  requiredMoney,
  requiredText,
} from "./sale-row.mapper";

export interface RegisterQuery {
  readonly storeId: string;
  readonly filters: SaleRegisterFilters;
  readonly range: SoldAtRange;
}

const FROM_SQL =
  "FROM sales s LEFT JOIN customers c ON c.id = s.customer_id";

/** Zone-less (synced) and `Z` (local) timestamps only compare correctly once normalised. */
const SOLD_AT = "datetime(s.sold_at)";

const SORT_COLUMNS: Record<SaleSortField, string> = {
  soldAt: SOLD_AT,
  // Natural order for same-prefix invoices: INV-99 before INV-100.
  invoiceNumber: "length(s.invoice_number), s.invoice_number COLLATE NOCASE",
  totalAmount: "CAST(s.total_amount AS REAL)",
  remaining: "CAST(s.remaining AS REAL)",
};

const PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "BANK", "CREDIT"];

/** Read side of the sales register (use case 5c), served from the local synced database. */
@Injectable({ providedIn: "root" })
export class SaleRegisterRepository {
  private readonly database = inject(DatabaseService);

  watchPage(
    query: RegisterQuery,
    sort: SaleSort,
    request: SalePageRequest,
  ): Observable<SalePage> {
    const { whereSql, parameters } = buildWhere(query);
    const direction = sort.direction === "asc" ? "ASC" : "DESC";
    const orderSql = (SORT_COLUMNS[sort.field] ?? SORT_COLUMNS.soldAt)
      .split(", ")
      .map((column) => `${column} ${direction}`)
      .join(", ");
    const offset = request.pageIndex * request.pageSize;
    return this.database
      .watch(
        `SELECT s.id, s.invoice_number, s.sold_at, s.status, s.sale_type, s.total_amount,
           s.total_paid, s.remaining, s.customer_id, c.name AS customer_name, u.name AS cashier_name,
           (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id) AS item_count,
           (SELECT group_concat(DISTINCT p.method) FROM payments p WHERE p.sale_id = s.id) AS payment_methods,
           (SELECT COUNT(*) ${FROM_SQL} WHERE ${whereSql}) AS total_count
         ${FROM_SQL}
         LEFT JOIN users u ON u.id = s.user_id
         WHERE ${whereSql}
         ORDER BY ${orderSql}, s.id ${direction}
         LIMIT ? OFFSET ?`,
        [...parameters, ...parameters, request.pageSize, offset],
      )
      .pipe(map((rows) => toPage(rows)));
  }

  /** Totals for the whole filtered register, not just the visible page. */
  watchSummary(query: RegisterQuery): Observable<SaleRegisterSummary> {
    const { whereSql, parameters } = buildWhere(query);
    const completed = (column: string) =>
      `printf('%.2f', COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN CAST(${column} AS REAL) END), 0))`;
    return this.database
      .watch(
        `SELECT
           COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS sale_count,
           ${completed("s.total_amount")} AS net_sales,
           ${completed("s.total_paid")} AS collected,
           ${completed("s.remaining")} AS outstanding,
           COALESCE(SUM(CASE WHEN s.status = 'VOIDED' THEN 1 ELSE 0 END), 0) AS voided_count,
           printf('%.2f', COALESCE(SUM(CASE WHEN s.status = 'VOIDED' THEN CAST(s.total_amount AS REAL) END), 0))
             AS voided_amount
         ${FROM_SQL}
         WHERE ${whereSql}`,
        parameters,
      )
      .pipe(map((rows) => toSummary(rows[0])));
  }

  watchCashiers(storeId: string): Observable<readonly CashierOption[]> {
    return this.database
      .watch(
        "SELECT id, name FROM users WHERE store_id = ? ORDER BY name COLLATE NOCASE, id",
        [storeId],
      )
      .pipe(
        map((rows) =>
          rows.map((row) => ({
            id: requiredText(row["id"], "users.id"),
            name: nullableText(row["name"], "users.name") ?? "Unnamed user",
          })),
        ),
      );
  }
}

export function buildWhere(query: RegisterQuery): {
  whereSql: string;
  parameters: SqliteValue[];
} {
  const { storeId, filters, range } = query;
  const where = ["s.store_id = ?"];
  const parameters: SqliteValue[] = [storeId];

  if (filters.status === "POSTED") {
    where.push("s.status IN ('COMPLETED', 'VOIDED')");
  } else {
    where.push("s.status = ?");
    parameters.push(filters.status);
  }
  if (range.from) {
    where.push(`${SOLD_AT} >= ?`);
    parameters.push(range.from);
  }
  if (range.to) {
    where.push(`${SOLD_AT} < ?`);
    parameters.push(range.to);
  }
  const search = filters.search.trim();
  if (search) {
    const pattern = likePattern(search);
    where.push(
      `(s.invoice_number LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR c.name LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR c.phone_number LIKE ? ESCAPE '\\' COLLATE NOCASE)`,
    );
    parameters.push(pattern, pattern, pattern);
  }
  if (filters.saleType !== "ALL") {
    where.push("s.sale_type = ?");
    parameters.push(filters.saleType);
  }
  if (filters.paymentMethod !== "ALL") {
    where.push(
      "EXISTS (SELECT 1 FROM payments p WHERE p.sale_id = s.id AND p.method = ?)",
    );
    parameters.push(filters.paymentMethod);
  }
  if (filters.cashierId) {
    where.push("s.user_id = ?");
    parameters.push(filters.cashierId);
  }
  if (filters.outstandingOnly) {
    where.push("CAST(s.remaining AS REAL) > 0");
  }
  return { whereSql: where.join(" AND "), parameters };
}

function toPage(rows: readonly SqliteRecord[]): SalePage {
  const total = rows.length ? Number(rows[0]["total_count"]) : 0;
  return { items: rows.map(toListItem), total };
}

function toListItem(row: SqliteRecord): SaleListItem {
  const customerId = nullableText(row["customer_id"], "customer_id");
  const methods = nullableText(row["payment_methods"], "payment_methods");
  return {
    id: requiredText(row["id"], "id"),
    invoiceNumber: requiredText(row["invoice_number"], "invoice_number"),
    soldAt: requiredDate(row["sold_at"], "sold_at"),
    status: oneOf(row["status"], ["IN_PROGRESS", "COMPLETED", "VOIDED"], "status"),
    saleType: oneOf(row["sale_type"], ["DEBIT", "CREDIT"], "sale_type"),
    customer: customerId
      ? {
          id: customerId,
          name: nullableText(row["customer_name"], "customer_name") ?? "Unknown customer",
        }
      : null,
    cashierName: nullableText(row["cashier_name"], "cashier_name"),
    itemCount: Number(row["item_count"] ?? 0),
    totalAmount: requiredMoney(row["total_amount"], "total_amount"),
    totalPaid: requiredMoney(row["total_paid"], "total_paid"),
    remaining: requiredMoney(row["remaining"], "remaining"),
    paymentMethods: methods
      ? methods
          .split(",")
          .filter((method): method is PaymentMethod =>
            (PAYMENT_METHODS as readonly string[]).includes(method),
          )
          .sort()
      : [],
  };
}

function toSummary(row: SqliteRecord | undefined): SaleRegisterSummary {
  const saleCount = Number(row?.["sale_count"] ?? 0);
  const netSales = requiredMoney(row?.["net_sales"] ?? "0", "net_sales");
  return {
    saleCount,
    netSales,
    collected: requiredMoney(row?.["collected"] ?? "0", "collected"),
    outstanding: requiredMoney(row?.["outstanding"] ?? "0", "outstanding"),
    averageSale:
      saleCount === 0
        ? "0.00"
        : fromScaled(divRound(toScaled(netSales, 2), BigInt(saleCount)), 2),
    voidedCount: Number(row?.["voided_count"] ?? 0),
    voidedAmount: requiredMoney(row?.["voided_amount"] ?? "0", "voided_amount"),
  };
}
