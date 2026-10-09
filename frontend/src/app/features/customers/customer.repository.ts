import { Injectable, inject } from "@angular/core";
import { SqliteRecord, SqliteValue } from "@powersync/common";
import { Observable, map } from "rxjs";

import {
  DatabaseExecutor,
  DatabaseService,
} from "../../core/database/database.service";
import {
  CustomerConflictError,
  CustomerNotFoundError,
  CustomerPersistenceError,
} from "./customer.errors";
import { Customer, CustomerStatus } from "./customer.model";
import {
  CustomerFilters,
  CustomerPage,
  CustomerPageRequest,
  CustomerSortField,
} from "./customer-query.model";

export type NewCustomerRecord = Customer;

export interface CustomerChanges {
  readonly name?: string;
  readonly phoneNumber?: string | null;
  readonly ntn?: string | null;
  readonly status?: CustomerStatus;
}

type UniqueKeyType = "name" | "phoneNumber";

interface UniqueKeyRow extends SqliteRecord {
  readonly customer_id: SqliteValue;
}

const CUSTOMER_COLUMNS =
  "id, name, phone_number, ntn, account_balance, status, store_id, date_created, last_updated";

const SORT_COLUMNS: Record<CustomerSortField, string> = {
  name: "c.name COLLATE NOCASE",
  accountBalance: "CAST(c.account_balance AS REAL)",
  lastUpdated: "c.last_updated",
};

const BALANCE_CONDITIONS = {
  OWES: "CAST(c.account_balance AS REAL) > 0",
  CREDIT: "CAST(c.account_balance AS REAL) < 0",
  SETTLED: "CAST(c.account_balance AS REAL) = 0",
} as const;

const UPDATE_FIELDS = [
  ["name", "name"],
  ["phoneNumber", "phone_number"],
  ["ntn", "ntn"],
  ["status", "status"],
] as const;

@Injectable({ providedIn: "root" })
export class CustomerRepository {
  private readonly database = inject(DatabaseService);

  async create(customer: NewCustomerRecord): Promise<Customer> {
    return this.database.writeTransaction(async (transaction) => {
      await this.insertUniqueKeys(
        transaction,
        customer.id,
        customer.storeId,
        this.uniqueValues(customer),
      );
      await transaction.execute(
        `INSERT INTO customers (${CUSTOMER_COLUMNS}) VALUES (${Array.from({ length: 9 }, () => "?").join(", ")})`,
        [
          customer.id,
          customer.name,
          customer.phoneNumber,
          customer.ntn,
          customer.accountBalance,
          customer.status,
          customer.storeId,
          customer.dateCreated,
          customer.lastUpdated,
        ],
      );
      return { ...customer };
    });
  }

  async findById(id: string, storeId: string): Promise<Customer | null> {
    const row = await this.database.getOptional<SqliteRecord>(
      `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = ? AND store_id = ?`,
      [id, storeId],
    );
    return row ? this.mapCustomerRow(row) : null;
  }

  async list(storeId: string, search = ""): Promise<readonly Customer[]> {
    const { sql, parameters } = this.listQuery(storeId, search);
    const rows = await this.database
      .getAll<SqliteRecord>(sql, parameters);
    return rows.map((row) => this.mapCustomerRow(row));
  }

  watch(storeId: string, search = ""): Observable<readonly Customer[]> {
    const { sql, parameters } = this.listQuery(storeId, search);
    return this.database
      .watch(sql, parameters)
      .pipe(map((rows) => rows.map((row) => this.mapCustomerRow(row))));
  }

  /** Emits a page of customers, re-running whenever the underlying tables change. */
  watchPage(
    storeId: string,
    filters: CustomerFilters,
    request: CustomerPageRequest,
  ): Observable<CustomerPage> {
    const { whereSql, parameters, orderSql } = this.filterQuery(
      storeId,
      filters,
    );
    const from = `FROM customers c WHERE ${whereSql}`;
    const offset = request.pageIndex * request.pageSize;
    return this.database
      .watch(
        `SELECT c.${CUSTOMER_COLUMNS.split(", ").join(", c.")},
          (SELECT COUNT(*) ${from}) AS total_count
         ${from} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
        [...parameters, ...parameters, request.pageSize, offset],
      )
      .pipe(map((rows) => this.toPage(rows)));
  }

  async update(
    id: string,
    storeId: string,
    changes: CustomerChanges,
  ): Promise<Customer> {
    return this.database.writeTransaction(async (transaction) => {
      const row = await this.requireCustomer(transaction, id, storeId);
      const previous = this.mapCustomerRow(row);
      const merged: Customer = {
        ...previous,
        ...changes,
        lastUpdated: new Date().toISOString(),
      };

      await transaction.execute(
        "DELETE FROM customer_unique_keys WHERE customer_id = ?",
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
        `UPDATE customers SET ${assignments.join(", ")} WHERE id = ? AND store_id = ?`,
        parameters,
      );
      return merged;
    });
  }

  async delete(id: string, storeId: string): Promise<void> {
    await this.database.writeTransaction(async (transaction) => {
      await this.requireCustomer(transaction, id, storeId);
      await transaction.execute(
        "DELETE FROM customer_unique_keys WHERE customer_id = ?",
        [id],
      );
      await transaction.execute(
        "DELETE FROM customers WHERE id = ? AND store_id = ?",
        [id, storeId],
      );
    });
  }

  private listQuery(
    storeId: string,
    search: string,
  ): { sql: string; parameters: SqliteValue[] } {
    const parameters: SqliteValue[] = [storeId];
    const where = ["c.store_id = ?"];
    const normalizedSearch = search.trim();

    if (normalizedSearch) {
      const pattern = likePattern(normalizedSearch);
      where.push(searchCondition());
      parameters.push(pattern, pattern, pattern);
    }

    return {
      sql: `
        SELECT c.${CUSTOMER_COLUMNS.split(", ").join(", c.")}
        FROM customers c
        WHERE ${where.join(" AND ")}
        ORDER BY c.name COLLATE NOCASE, c.id
      `,
      parameters,
    };
  }

  private filterQuery(
    storeId: string,
    filters: CustomerFilters,
  ): { whereSql: string; parameters: SqliteValue[]; orderSql: string } {
    const parameters: SqliteValue[] = [storeId];
    const where = ["c.store_id = ?"];
    const search = filters.search.trim();

    if (search) {
      const pattern = likePattern(search);
      where.push(searchCondition());
      parameters.push(pattern, pattern, pattern);
    }
    if (filters.status !== "ALL") {
      where.push("c.status = ?");
      parameters.push(filters.status);
    }
    if (filters.balance !== "ANY") {
      where.push(BALANCE_CONDITIONS[filters.balance]);
    }

    const direction = filters.sortDirection === "desc" ? "DESC" : "ASC";
    return {
      whereSql: where.join(" AND "),
      parameters,
      orderSql: `${SORT_COLUMNS[filters.sortField] ?? SORT_COLUMNS.name} ${direction}, c.id`,
    };
  }

  private toPage(rows: readonly SqliteRecord[]): CustomerPage {
    const total = rows.length ? Number(rows[0]["total_count"]) : 0;
    return { items: rows.map((row) => this.mapCustomerRow(row)), total };
  }

  private async requireCustomer(
    transaction: DatabaseExecutor,
    id: string,
    storeId: string,
  ): Promise<SqliteRecord> {
    const row = await transaction.getOptional<SqliteRecord>(
      `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = ? AND store_id = ?`,
      [id, storeId],
    );
    if (!row) {
      throw new CustomerNotFoundError(id);
    }
    return row;
  }

  private async insertUniqueKeys(
    transaction: DatabaseExecutor,
    customerId: string,
    storeId: string,
    values: readonly { readonly type: UniqueKeyType; readonly value: string }[],
  ): Promise<void> {
    for (const { type, value } of values) {
      const normalizedValue = value.toLowerCase();
      const id = JSON.stringify([storeId, type, normalizedValue]);
      const existing = await transaction.getOptional<UniqueKeyRow>(
        "SELECT customer_id FROM customer_unique_keys WHERE id = ?",
        [id],
      );
      if (existing) {
        if (requiredText(existing.customer_id, "customer_id") !== customerId) {
          throw new CustomerConflictError(type);
        }
        continue;
      }
      await transaction.execute(
        "INSERT INTO customer_unique_keys (id, customer_id, store_id, key_type, normalized_value) VALUES (?, ?, ?, ?, ?)",
        [id, customerId, storeId, type, normalizedValue],
      );
    }
  }

  private uniqueValues(
    customer: Pick<Customer, "name" | "phoneNumber">,
  ): readonly { readonly type: UniqueKeyType; readonly value: string }[] {
    const values: { type: UniqueKeyType; value: string }[] = [
      { type: "name", value: customer.name },
    ];
    if (customer.phoneNumber !== null) {
      values.push({ type: "phoneNumber", value: customer.phoneNumber });
    }
    return values;
  }

  private mapCustomerRow(row: SqliteRecord): Customer {
    const status = requiredText(row["status"], "status");
    if (status !== "ACTIVE" && status !== "INACTIVE") {
      throw new CustomerPersistenceError(
        `Unexpected customer status "${status}" in local storage.`,
      );
    }
    return {
      id: requiredText(row["id"], "id"),
      name: requiredText(row["name"], "name"),
      phoneNumber: nullableText(row["phone_number"], "phone_number"),
      ntn: nullableText(row["ntn"], "ntn"),
      accountBalance: requiredBalance(row["account_balance"], "account_balance"),
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
  return `(${["c.name", "c.phone_number", "c.ntn"]
    .map((column) => `${column} LIKE ? ESCAPE '\\' COLLATE NOCASE`)
    .join(" OR ")})`;
}

function requiredText(value: SqliteValue, column: string): string {
  if (typeof value !== "string") {
    throw new CustomerPersistenceError(
      `Expected text in local customer column "${column}".`,
    );
  }
  return value;
}

function nullableText(value: SqliteValue, column: string): string | null {
  return value === null ? null : requiredText(value, column);
}

function requiredBalance(value: SqliteValue, column: string): string {
  if (typeof value !== "string" || !/^-?\d{1,16}\.\d{2}$/.test(value)) {
    throw new CustomerPersistenceError(
      `Expected a signed two-decimal string in local customer column "${column}".`,
    );
  }
  return value;
}
