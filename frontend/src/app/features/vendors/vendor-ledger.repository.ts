import { Injectable, inject } from "@angular/core";
import { SqliteRecord, SqliteValue } from "@powersync/common";
import { Observable, map } from "rxjs";

import { DatabaseService } from "../../core/database/database.service";
import { fromScaled, money } from "../../shared/utils/decimal";
import { parseSqlTimestamp } from "../sales/domain/sale-date-range";
import { VendorPersistenceError } from "./vendor.errors";
import {
  LedgerDateRange,
  LedgerPageRequest,
  LedgerSort,
  LedgerSortField,
  VendorLedgerEntry,
  VendorLedgerFilters,
  VendorLedgerPage,
  VendorLedgerSummary,
} from "./vendor-ledger.model";

export interface VendorLedgerQuery {
  readonly vendorId: string;
  readonly storeId: string;
  readonly filters: VendorLedgerFilters;
  readonly range: LedgerDateRange;
}

const OCCURRED_AT = "datetime(l.date_created)";
const AMOUNT_CENTS = "CAST(ROUND(CAST(l.amount AS REAL) * 100) AS INTEGER)";
const POSTING_ORDER = `${OCCURRED_AT}, CASE WHEN l.direction = 'DEBIT' THEN 0 ELSE 1 END, l.id`;

const SORT_COLUMNS: Record<LedgerSortField, readonly string[]> = {
  occurredAt: ["f.seq"],
  type: ["f.type COLLATE NOCASE"],
  referenceNumber: ["length(f.reference_number)", "f.reference_number COLLATE NOCASE"],
  description: ["f.description COLLATE NOCASE"],
  debit: ["CASE WHEN f.direction = 'DEBIT' THEN f.amount_cents END"],
  credit: ["CASE WHEN f.direction = 'CREDIT' THEN f.amount_cents END"],
  balance: ["f.balance_cents"],
};

@Injectable({ providedIn: "root" })
export class VendorLedgerRepository {
  private readonly database = inject(DatabaseService);

  watchPage(
    query: VendorLedgerQuery,
    sort: LedgerSort,
    request: LedgerPageRequest,
  ): Observable<VendorLedgerPage> {
    const { whereSql, parameters } = buildVendorLedgerWhere(query);
    const direction = sort.direction === "asc" ? "ASC" : "DESC";
    const orderSql = (SORT_COLUMNS[sort.field] ?? SORT_COLUMNS.occurredAt)
      .map((column) => `${column} ${direction} NULLS LAST`)
      .join(", ");
    const offset = request.pageIndex * request.pageSize;

    return this.database
      .watch(
        `WITH ledger AS (
           SELECT l.id, l.direction, l.amount, l.type, l.reference_number, l.description,
             l.voided, l.void_reason, l.payment_id, l.reversal_of_entry_id, l.date_created,
             ${OCCURRED_AT} AS occurred_at,
             ${AMOUNT_CENTS} AS amount_cents,
             ROW_NUMBER() OVER (ORDER BY ${POSTING_ORDER}) AS seq,
             SUM(CASE WHEN l.direction = 'DEBIT' THEN ${AMOUNT_CENTS} ELSE -${AMOUNT_CENTS} END)
               OVER (ORDER BY ${POSTING_ORDER} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
               AS balance_cents
           FROM ledger_entries l
           JOIN vendors v ON v.id = l.vendor_id
           WHERE l.vendor_id = ? AND v.store_id = ?
         ),
         filtered AS (SELECT * FROM ledger WHERE ${whereSql})
         SELECT f.*,
           (SELECT COUNT(*) FROM filtered) AS total_count,
           (SELECT COALESCE(SUM(amount_cents), 0) FROM filtered WHERE direction = 'DEBIT') AS debit_cents,
           (SELECT COALESCE(SUM(amount_cents), 0) FROM filtered WHERE direction = 'CREDIT') AS credit_cents
         FROM filtered f
         ORDER BY ${orderSql}, f.seq ${direction}
         LIMIT ? OFFSET ?`,
        [query.vendorId, query.storeId, ...parameters, request.pageSize, offset],
      )
      .pipe(map((rows) => toVendorLedgerPage(rows)));
  }

  async getSummary(query: VendorLedgerQuery): Promise<VendorLedgerSummary> {
    const { vendorId, storeId, range } = query;
    const vendorRow = await this.database.getOptional<{ account_balance: string }>(
      "SELECT account_balance FROM vendors WHERE id = ? AND store_id = ?",
      [vendorId, storeId],
    );
    const currentBalance = vendorRow?.account_balance ?? "0.00";

    let openingCents = 0;
    if (range.from) {
      const openRow = await this.database.getOptional<{ balance: number }>(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN ${AMOUNT_CENTS} ELSE -${AMOUNT_CENTS} END), 0) AS balance
         FROM ledger_entries WHERE vendor_id = ? AND store_id = ? AND ${OCCURRED_AT} < ?`,
        [vendorId, storeId, range.from],
      );
      openingCents = openRow?.balance ?? 0;
    }

    let closingCents = 0;
    if (range.to) {
      const closeRow = await this.database.getOptional<{ balance: number }>(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN ${AMOUNT_CENTS} ELSE -${AMOUNT_CENTS} END), 0) AS balance
         FROM ledger_entries WHERE vendor_id = ? AND store_id = ? AND ${OCCURRED_AT} < ?`,
        [vendorId, storeId, range.to],
      );
      closingCents = closeRow?.balance ?? 0;
    } else {
      closingCents = Number(Math.round(parseFloat(currentBalance) * 100));
    }

    const { whereSql, parameters } = buildVendorLedgerWhere(query);
    const totalsRow = await this.database.getOptional<{ debit: number; credit: number }>(
      `WITH ledger AS (
         SELECT direction, ${OCCURRED_AT} AS occurred_at, ${AMOUNT_CENTS} AS amount_cents,
                reference_number, description, amount, type, voided
         FROM ledger_entries WHERE vendor_id = ? AND store_id = ?
       )
       SELECT
         COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount_cents ELSE 0 END), 0) AS debit,
         COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_cents ELSE 0 END), 0) AS credit
       FROM ledger WHERE ${whereSql}`,
      [vendorId, storeId, ...parameters],
    );

    return {
      currentBalance,
      openingBalance: centsToMoney(openingCents, "openingBalance"),
      closingBalance: centsToMoney(closingCents, "closingBalance"),
      debitTotal: centsToMoney(totalsRow?.debit ?? 0, "debitTotal"),
      creditTotal: centsToMoney(totalsRow?.credit ?? 0, "creditTotal"),
    };
  }
}

export function buildVendorLedgerWhere(query: VendorLedgerQuery): {
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
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
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

function toVendorLedgerPage(rows: readonly SqliteRecord[]): VendorLedgerPage {
  const first = rows[0];
  return {
    items: rows.map(toVendorLedgerEntry),
    total: first ? Number(first["total_count"]) : 0,
    totalDebit: centsToMoney(first?.["debit_cents"] ?? 0, "debit_cents"),
    totalCredit: centsToMoney(first?.["credit_cents"] ?? 0, "credit_cents"),
  };
}

function toVendorLedgerEntry(row: SqliteRecord): VendorLedgerEntry {
  const direction = requiredText(row["direction"], "direction");
  if (direction !== "DEBIT" && direction !== "CREDIT") {
    throw new VendorPersistenceError(
      `Unexpected ledger direction "${direction}" in local storage.`,
    );
  }
  const occurredAt = parseSqlTimestamp(requiredText(row["date_created"], "date_created"));
  if (!occurredAt) {
    throw new VendorPersistenceError("Invalid ledger date_created in local storage.");
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
    paymentId: nullableText(row["payment_id"], "payment_id"),
    reversalOfEntryId: nullableText(row["reversal_of_entry_id"], "reversal_of_entry_id"),
    balanceAfter: centsToMoney(row["balance_cents"], "balance_cents"),
  };
}

function requiredText(value: SqliteValue | undefined, column: string): string {
  if (typeof value !== "string" || value === "") {
    throw new VendorPersistenceError(
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
    throw new VendorPersistenceError(`Invalid ledger ${column} in local storage.`);
  }
}

function centsToMoney(value: SqliteValue | undefined, column: string): string {
  if (typeof value !== "number" && typeof value !== "bigint") {
    throw new VendorPersistenceError(`Invalid ledger ${column} in local storage.`);
  }
  return fromScaled(BigInt(value), 2);
}

