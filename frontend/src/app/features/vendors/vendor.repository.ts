import { Injectable, inject } from "@angular/core";
import { SqliteRecord, SqliteValue } from "@powersync/common";
import { Observable, map } from "rxjs";

import {
  DatabaseExecutor,
  DatabaseService,
} from "../../core/database/database.service";
import {
  VendorConflictError,
  VendorNotFoundError,
  VendorPersistenceError,
} from "./vendor.errors";
import { TaxRegistrationStatus, Vendor, VendorStatus } from "./vendor.model";
import {
  VendorFilters,
  VendorPage,
  VendorPageRequest,
  VendorSortField,
} from "./vendor-query.model";

export type NewVendorRecord = Vendor;

export interface VendorChanges {
  readonly name?: string;
  readonly phoneNumber?: string | null;
  readonly ntn?: string | null;
  readonly strn?: string | null;
  readonly salesTaxRegistrationStatus?: TaxRegistrationStatus;
  readonly address?: string | null;
  readonly status?: VendorStatus;
}

type UniqueKeyType = "name" | "phoneNumber";

interface UniqueKeyRow extends SqliteRecord {
  readonly vendor_id: SqliteValue;
}

const VENDOR_COLUMNS =
  "id, name, phone_number, ntn, strn, sales_tax_registration_status, address, account_balance, status, store_id, date_created, last_updated";

const SORT_COLUMNS: Record<VendorSortField, string> = {
  name: "v.name COLLATE NOCASE",
  accountBalance: "CAST(v.account_balance AS REAL)",
  lastUpdated: "v.last_updated",
};

const UPDATE_FIELDS = [
  ["name", "name"],
  ["phoneNumber", "phone_number"],
  ["ntn", "ntn"],
  ["strn", "strn"],
  ["salesTaxRegistrationStatus", "sales_tax_registration_status"],
  ["address", "address"],
  ["status", "status"],
] as const;

export interface DeleteVendorResult {
  readonly type: "HARD_DELETED" | "SOFT_DELETED";
  readonly vendor?: Vendor;
}

@Injectable({ providedIn: "root" })
export class VendorRepository {
  private readonly database = inject(DatabaseService);

  async create(vendor: NewVendorRecord): Promise<Vendor> {
    return this.database.writeTransaction(async (transaction) => {
      await this.insertUniqueKeys(
        transaction,
        vendor.id,
        vendor.storeId,
        this.uniqueValues(vendor),
      );
      await transaction.execute(
        `INSERT INTO vendors (${VENDOR_COLUMNS}) VALUES (${Array.from({ length: 12 }, () => "?").join(", ")})`,
        [
          vendor.id,
          vendor.name,
          vendor.phoneNumber,
          vendor.ntn,
          vendor.strn,
          vendor.salesTaxRegistrationStatus,
          vendor.address,
          vendor.accountBalance,
          vendor.status,
          vendor.storeId,
          vendor.dateCreated,
          vendor.lastUpdated,
        ],
      );
      return { ...vendor };
    });
  }

  async findById(id: string, storeId: string): Promise<Vendor | null> {
    const row = await this.database.getOptional<SqliteRecord>(
      `SELECT ${VENDOR_COLUMNS} FROM vendors WHERE id = ? AND store_id = ?`,
      [id, storeId],
    );
    return row ? this.mapVendorRow(row) : null;
  }

  watchById(id: string, storeId: string): Observable<Vendor | null> {
    return this.database
      .watch(
        `SELECT ${VENDOR_COLUMNS} FROM vendors WHERE id = ? AND store_id = ?`,
        [id, storeId],
      )
      .pipe(map((rows) => (rows[0] ? this.mapVendorRow(rows[0]) : null)));
  }

  async list(storeId: string, search = ""): Promise<readonly Vendor[]> {
    const { sql, parameters } = this.listQuery(storeId, search);
    const rows = await this.database.getAll<SqliteRecord>(sql, parameters);
    return rows.map((row) => this.mapVendorRow(row));
  }

  watch(storeId: string, search = ""): Observable<readonly Vendor[]> {
    const { sql, parameters } = this.listQuery(storeId, search);
    return this.database
      .watch(sql, parameters)
      .pipe(map((rows) => rows.map((row) => this.mapVendorRow(row))));
  }

  /** Emits a page of vendors, re-running whenever the underlying tables change. */
  watchPage(
    storeId: string,
    filters: VendorFilters,
    request: VendorPageRequest,
  ): Observable<VendorPage> {
    const { whereSql, parameters, orderSql } = this.filterQuery(
      storeId,
      filters,
    );
    const from = `FROM vendors v WHERE ${whereSql}`;
    const offset = request.pageIndex * request.pageSize;
    return this.database
      .watch(
        `SELECT v.${VENDOR_COLUMNS.split(", ").join(", v.")},
          (SELECT COUNT(*) ${from}) AS total_count
         ${from} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
        [...parameters, ...parameters, request.pageSize, offset],
      )
      .pipe(map((rows) => this.toPage(rows)));
  }

  async update(
    id: string,
    storeId: string,
    changes: VendorChanges,
  ): Promise<Vendor> {
    return this.database.writeTransaction(async (transaction) => {
      const row = await this.requireVendor(transaction, id, storeId);
      const previous = this.mapVendorRow(row);
      const merged: Vendor = {
        ...previous,
        ...changes,
        lastUpdated: new Date().toISOString(),
      };

      await transaction.execute(
        "DELETE FROM vendor_unique_keys WHERE vendor_id = ?",
        [id],
      );
      await this.insertUniqueKeys(
        transaction,
        id,
        storeId,
        this.uniqueValues(merged),
      );

      const assignments: string[] = [];
      const parameters: SqliteValue[] = [];
      for (const [field, column] of UPDATE_FIELDS) {
        const value = changes[field];
        if (value === undefined) {
          continue;
        }
        assignments.push(`${column} = ?`);
        parameters.push(value);
      }
      assignments.push("last_updated = ?");
      parameters.push(merged.lastUpdated, id, storeId);

      await transaction.execute(
        `UPDATE vendors SET ${assignments.join(", ")} WHERE id = ? AND store_id = ?`,
        parameters,
      );
      return merged;
    });
  }

  async delete(id: string, storeId: string): Promise<DeleteVendorResult> {
    return this.database.writeTransaction(async (transaction) => {
      const row = await this.requireVendor(transaction, id, storeId);
      const vendor = this.mapVendorRow(row);

      // 1. Balance must be 0.00
      if (vendor.accountBalance !== "0.00" && vendor.accountBalance !== "0") {
        throw new VendorConflictError("balance");
      }

      // 2. Check if history exists (payments or ledger entries)
      const hasPayment = await transaction.getOptional(
        "SELECT 1 FROM payments WHERE vendor_id = ? LIMIT 1",
        [id],
      );
      const hasLedger = await transaction.getOptional(
        "SELECT 1 FROM ledger_entries WHERE vendor_id = ? LIMIT 1",
        [id],
      );

      if (hasPayment || hasLedger) {
        // Soft delete: deactivate
        const now = new Date().toISOString();
        await transaction.execute(
          "UPDATE vendors SET status = 'INACTIVE', last_updated = ? WHERE id = ? AND store_id = ?",
          [now, id, storeId],
        );
        return {
          type: "SOFT_DELETED",
          vendor: { ...vendor, status: "INACTIVE", lastUpdated: now },
        };
      }

      // Hard delete: purge completely
      await transaction.execute(
        "DELETE FROM vendor_unique_keys WHERE vendor_id = ?",
        [id],
      );
      await transaction.execute(
        "DELETE FROM vendors WHERE id = ? AND store_id = ?",
        [id, storeId],
      );
      return { type: "HARD_DELETED" };
    });
  }

  private listQuery(
    storeId: string,
    search: string,
  ): { sql: string; parameters: SqliteValue[] } {
    const parameters: SqliteValue[] = [storeId];
    const where = ["v.store_id = ?"];
    const normalizedSearch = search.trim();

    if (normalizedSearch) {
      const pattern = likePattern(normalizedSearch);
      where.push(searchCondition());
      parameters.push(pattern, pattern, pattern, pattern);
    }

    return {
      sql: `
        SELECT v.${VENDOR_COLUMNS.split(", ").join(", v.")}
        FROM vendors v
        WHERE ${where.join(" AND ")}
        ORDER BY v.name COLLATE NOCASE, v.id
      `,
      parameters,
    };
  }

  private filterQuery(
    storeId: string,
    filters: VendorFilters,
  ): { whereSql: string; parameters: SqliteValue[]; orderSql: string } {
    const parameters: SqliteValue[] = [storeId];
    const where = ["v.store_id = ?"];
    const search = filters.search.trim();

    if (search) {
      const pattern = likePattern(search);
      where.push(searchCondition());
      parameters.push(pattern, pattern, pattern, pattern);
    }
    if (filters.status !== "ALL") {
      where.push("v.status = ?");
      parameters.push(filters.status);
    }
    if (filters.salesTaxRegistrationStatus !== "ALL") {
      where.push("v.sales_tax_registration_status = ?");
      parameters.push(filters.salesTaxRegistrationStatus);
    }
    if (filters.balanceState === "PARTY_OWES_STORE") {
      where.push("CAST(v.account_balance AS REAL) > 0");
    } else if (filters.balanceState === "STORE_OWES_PARTY") {
      where.push("CAST(v.account_balance AS REAL) < 0");
    } else if (filters.balanceState === "SETTLED") {
      where.push("CAST(v.account_balance AS REAL) = 0");
    }

    if (filters.minBalance !== null && filters.minBalance !== undefined && filters.minBalance !== "") {
      where.push("CAST(v.account_balance AS REAL) >= CAST(? AS REAL)");
      parameters.push(filters.minBalance);
    }
    if (filters.maxBalance !== null && filters.maxBalance !== undefined && filters.maxBalance !== "") {
      where.push("CAST(v.account_balance AS REAL) <= CAST(? AS REAL)");
      parameters.push(filters.maxBalance);
    }

    const direction = filters.sortDirection === "desc" ? "DESC" : "ASC";
    return {
      whereSql: where.join(" AND "),
      parameters,
      orderSql: `${SORT_COLUMNS[filters.sortField] ?? SORT_COLUMNS.name} ${direction}, v.id`,
    };
  }

  private toPage(rows: readonly SqliteRecord[]): VendorPage {
    const total = rows.length ? Number(rows[0]["total_count"]) : 0;
    return { items: rows.map((row) => this.mapVendorRow(row)), total };
  }

  private async requireVendor(
    transaction: DatabaseExecutor,
    id: string,
    storeId: string,
  ): Promise<SqliteRecord> {
    const row = await transaction.getOptional<SqliteRecord>(
      `SELECT ${VENDOR_COLUMNS} FROM vendors WHERE id = ? AND store_id = ?`,
      [id, storeId],
    );
    if (!row) {
      throw new VendorNotFoundError(id);
    }
    return row;
  }

  private async insertUniqueKeys(
    transaction: DatabaseExecutor,
    vendorId: string,
    storeId: string,
    values: readonly { readonly type: UniqueKeyType; readonly value: string }[],
  ): Promise<void> {
    for (const { type, value } of values) {
      const normalizedValue = value.toLowerCase();
      // Name is unique per store; phone number is globally unique among vendors
      const scope = type === "phoneNumber" ? "global" : storeId;
      const id = JSON.stringify([scope, type, normalizedValue]);
      const existing = await transaction.getOptional<UniqueKeyRow>(
        "SELECT vendor_id FROM vendor_unique_keys WHERE id = ?",
        [id],
      );
      if (existing) {
        if (requiredText(existing.vendor_id, "vendor_id") !== vendorId) {
          throw new VendorConflictError(type);
        }
        continue;
      }
      await transaction.execute(
        "INSERT INTO vendor_unique_keys (id, vendor_id, store_id, key_type, normalized_value) VALUES (?, ?, ?, ?, ?)",
        [id, vendorId, storeId, type, normalizedValue],
      );
    }
  }

  private uniqueValues(
    vendor: Pick<Vendor, "name" | "phoneNumber">,
  ): readonly { readonly type: UniqueKeyType; readonly value: string }[] {
    const values: { type: UniqueKeyType; value: string }[] = [
      { type: "name", value: vendor.name },
    ];
    if (vendor.phoneNumber !== null && vendor.phoneNumber.trim() !== "") {
      values.push({ type: "phoneNumber", value: vendor.phoneNumber });
    }
    return values;
  }

  private mapVendorRow(row: SqliteRecord): Vendor {
    const status = requiredText(row["status"], "status");
    if (status !== "ACTIVE" && status !== "INACTIVE") {
      throw new VendorPersistenceError(
        `Unexpected vendor status "${status}" in local storage.`,
      );
    }
    const regStatus = requiredText(
      row["sales_tax_registration_status"],
      "sales_tax_registration_status",
    );
    if (regStatus !== "REGISTERED" && regStatus !== "UNREGISTERED") {
      throw new VendorPersistenceError(
        `Unexpected vendor sales_tax_registration_status "${regStatus}" in local storage.`,
      );
    }
    return {
      id: requiredText(row["id"], "id"),
      name: requiredText(row["name"], "name"),
      phoneNumber: nullableText(row["phone_number"], "phone_number"),
      ntn: nullableText(row["ntn"], "ntn"),
      strn: nullableText(row["strn"], "strn"),
      salesTaxRegistrationStatus: regStatus,
      address: nullableText(row["address"], "address"),
      accountBalance: requiredBalance(
        row["account_balance"],
        "account_balance",
      ),
      status,
      storeId: requiredText(row["store_id"], "store_id"),
      dateCreated: requiredText(row["date_created"], "date_created"),
      lastUpdated: requiredText(row["last_updated"], "last_updated"),
    };
  }
}

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

function searchCondition(): string {
  return `(${["v.name", "v.phone_number", "v.ntn", "v.strn"]
    .map((column) => `${column} LIKE ? ESCAPE '\\' COLLATE NOCASE`)
    .join(" OR ")})`;
}

function requiredText(value: SqliteValue, column: string): string {
  if (typeof value !== "string") {
    throw new VendorPersistenceError(
      `Expected text in local vendor column "${column}".`,
    );
  }
  return value;
}

function nullableText(value: SqliteValue, column: string): string | null {
  return value === null ? null : requiredText(value, column);
}

function requiredBalance(value: SqliteValue, column: string): string {
  if (typeof value !== "string" || !/^-?\d{1,16}\.\d{2}$/.test(value)) {
    throw new VendorPersistenceError(
      `Expected a signed two-decimal string in local vendor column "${column}".`,
    );
  }
  return value;
}

