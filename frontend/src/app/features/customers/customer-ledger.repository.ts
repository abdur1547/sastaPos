import { Injectable, inject } from "@angular/core";
import { SqliteRecord, SqliteValue } from "@powersync/common";
import { Observable, map } from "rxjs";

import { DatabaseService } from "../../core/database/database.service";
import { fromScaled, money } from "../../shared/utils/decimal";
import { parseSqlTimestamp } from "../sales/domain/sale-date-range";
import { CustomerPersistenceError } from "./customer.errors";
import {
  CustomerLedgerEntry,
  CustomerLedgerFilters,
  CustomerLedgerPage,
  LedgerDateRange,
  LedgerPageRequest,
  LedgerSort,
  LedgerSortField,
} from "./customer-ledger.model";

export interface CustomerLedgerQuery {
  readonly customerId: string;
  readonly storeId: string;
  readonly filters: CustomerLedgerFilters;
  readonly range: LedgerDateRange;
}

/** Zone-less (synced) and `Z` (local) timestamps only compare correctly once normalised. */
const OCCURRED_AT = "datetime(l.date_created)";
const AMOUNT_CENTS = "CAST(ROUND(CAST(l.amount AS REAL) * 100) AS INTEGER)";
/**
 * Posting order. Entries written together (a sale and its payments) share a timestamp, so debits
 * come before credits to keep the running balance readable.
 */
const POSTING_ORDER = `${OCCURRED_AT}, CASE WHEN l.direction = 'DEBIT' THEN 0 ELSE 1 END, l.id`;

const SORT_COLUMNS: Record<LedgerSortField, readonly string[]> = {
  occurredAt: ["f.seq"],
  type: ["f.type COLLATE NOCASE"],
  // Natural order for same-prefix references: INV-99 before INV-100.
  referenceNumber: ["length(f.reference_number)", "f.reference_number COLLATE NOCASE"],
  description: ["f.description COLLATE NOCASE"],
  debit: ["CASE WHEN f.direction = 'DEBIT' THEN f.amount_cents END"],
  credit: ["CASE WHEN f.direction = 'CREDIT' THEN f.amount_cents END"],
  balance: ["f.balance_cents"],
};

/** Read side of a customer's account history, served from the local synced database. */
@Injectable({ providedIn: "root" })
export class CustomerLedgerRepository {
  private readonly database = inject(DatabaseService);

  watchPage(
    query: CustomerLedgerQuery,
    sort: LedgerSort,
    request: LedgerPageRequest,
  ): Observable<CustomerLedgerPage> {
    const { whereSql, parameters } = buildLedgerWhere(query);
    const direction = sort.direction === "asc" ? "ASC" : "DESC";
    const orderSql = (SORT_COLUMNS[sort.field] ?? SORT_COLUMNS.occurredAt)
      .map((column) => `${column} ${direction} NULLS LAST`)
      .join(", ");
    const offset = request.pageIndex * request.pageSize;
    return this.database
      .watch(
        `WITH ledger AS (
           SELECT l.id, l.direction, l.amount, l.type, l.reference_number, l.description,
             l.voided, l.void_reason, l.sale_id, l.date_created,
             ${OCCURRED_AT} AS occurred_at,
             ${AMOUNT_CENTS} AS amount_cents,
             ROW_NUMBER() OVER (ORDER BY ${POSTING_ORDER}) AS seq,
             SUM(CASE WHEN l.direction = 'DEBIT' THEN ${AMOUNT_CENTS} ELSE -${AMOUNT_CENTS} END)
               OVER (ORDER BY ${POSTING_ORDER} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
               AS balance_cents
           FROM ledger_entries l
           JOIN customers c ON c.id = l.customer_id
           WHERE l.customer_id = ? AND c.store_id = ?
         ),
         filtered AS (SELECT * FROM ledger WHERE ${whereSql})
         SELECT f.*,
           (SELECT COUNT(*) FROM filtered) AS total_count,
           (SELECT COALESCE(SUM(amount_cents), 0) FROM filtered WHERE direction = 'DEBIT') AS debit_cents,
           (SELECT COALESCE(SUM(amount_cents), 0) FROM filtered WHERE direction = 'CREDIT') AS credit_cents
         FROM filtered f
         ORDER BY ${orderSql}, f.seq ${direction}
         LIMIT ? OFFSET ?`,
        [query.customerId, query.storeId, ...parameters, request.pageSize, offset],
      )
      .pipe(map((rows) => toPage(rows)));
  }
}

/** Conditions over the `ledger` CTE columns. */
export function buildLedgerWhere(query: CustomerLedgerQuery): {
  whereSql: string;
  parameters: SqliteValue[];
} {
  const { filters, range } = query;
  const where = ["1 = 1"];
  const parameters: SqliteValue[] = [];

  if (range.from) {
    where.push("occurred_at >= ?");
    parameters.push(range.from);
  }
  if (range.to) {
    where.push("occurred_at < ?");
    parameters.push(range.to);
  }
  const search = filters.search.trim();
  if (search) {
    const pattern = likePattern(search);
    where.push(
      `(reference_number LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR description LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR amount LIKE ? ESCAPE '\\')`,
    );
    parameters.push(pattern, pattern, pattern);
  }
  if (filters.type !== "ALL") {
    where.push("type = ?");
    parameters.push(filters.type);
  }
  if (filters.direction !== "ALL") {
    where.push("direction = ?");
    parameters.push(filters.direction);
  }
  if (filters.status === "VOIDED") {
    where.push("COALESCE(voided, 0) = 1");
  } else if (filters.status === "ACTIVE") {
    where.push("COALESCE(voided, 0) = 0");
  }
  return { whereSql: where.join(" AND "), parameters };
}

function toPage(rows: readonly SqliteRecord[]): CustomerLedgerPage {
  const first = rows[0];
  return {
    items: rows.map(toEntry),
    total: first ? Number(first["total_count"]) : 0,
    totalDebit: centsToMoney(first?.["debit_cents"] ?? 0, "debit_cents"),
    totalCredit: centsToMoney(first?.["credit_cents"] ?? 0, "credit_cents"),
  };
}

function toEntry(row: SqliteRecord): CustomerLedgerEntry {
  const direction = requiredText(row["direction"], "direction");
  if (direction !== "DEBIT" && direction !== "CREDIT") {
    throw new CustomerPersistenceError(
      `Unexpected ledger direction "${direction}" in local storage.`,
    );
  }
  const occurredAt = parseSqlTimestamp(requiredText(row["date_created"], "date_created"));
  if (!occurredAt) {
    throw new CustomerPersistenceError("Invalid ledger date_created in local storage.");
  }
  return {
    id: requiredText(row["id"], "id"),
    occurredAt,
    direction,
    type: requiredText(row["type"], "type"),
    amount: requiredMoney(row["amount"], "amount"),
    referenceNumber: nullableText(row["reference_number"], "reference_number"),
    description: nullableText(row["description"], "description"),
    voided: Number(row["voided"] ?? 0) === 1,
    voidReason: nullableText(row["void_reason"], "void_reason"),
    saleId: nullableText(row["sale_id"], "sale_id"),
    balanceAfter: centsToMoney(row["balance_cents"], "balance_cents"),
  };
}

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

function requiredText(value: SqliteValue | undefined, column: string): string {
  if (typeof value !== "string" || value === "") {
    throw new CustomerPersistenceError(
      `Expected text in local ledger column "${column}".`,
    );
  }
  return value;
}

function nullableText(value: SqliteValue | undefined, column: string): string | null {
  return value === null || value === undefined ? null : requiredText(value, column);
}

function requiredMoney(value: SqliteValue | undefined, column: string): string {
  try {
    return money(typeof value === "number" ? value : requiredText(value, column));
  } catch {
    throw new CustomerPersistenceError(`Invalid ledger ${column} in local storage.`);
  }
}

function centsToMoney(value: SqliteValue | undefined, column: string): string {
  if (typeof value !== "number" && typeof value !== "bigint") {
    throw new CustomerPersistenceError(`Invalid ledger ${column} in local storage.`);
  }
  return fromScaled(BigInt(value), 2);
}
