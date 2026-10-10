import { Injectable, inject } from "@angular/core";
import { SqliteRecord, SqliteValue } from "@powersync/common";
import { Observable, map } from "rxjs";

import {
  DatabaseExecutor,
  DatabaseService,
} from "../../core/database/database.service";
import {
  ProductConflictError,
  ProductNotFoundError,
  ProductPersistenceError,
} from "./product.errors";
import { Product, ProductStatus } from "./product.model";
import {
  ProductFilters,
  ProductListItem,
  ProductPage,
  ProductPageRequest,
  ProductSortField,
} from "./product-query.model";

export interface NewProductRecord {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly pctCode: string;
  readonly description: string | null;
  readonly unitPrice: string;
  readonly stockQuantity: string;
  readonly status: ProductStatus;
  readonly unitsOfMeasureId: string;
  readonly taxCategoryIds: readonly string[];
  readonly storeId: string;
  readonly dateCreated: string;
  readonly lastUpdated: string;
}

export interface ProductChanges {
  readonly name?: string;
  readonly sku?: string | null;
  readonly barcode?: string | null;
  readonly pctCode?: string;
  readonly description?: string | null;
  readonly unitPrice?: string;
  readonly status?: ProductStatus;
  readonly unitsOfMeasureId?: string;
  readonly taxCategoryIds?: readonly string[];
}

interface UniqueKeyRow extends SqliteRecord {
  readonly product_id: SqliteValue;
}

const PRODUCT_COLUMNS =
  "id, name, sku, barcode, pct_code, description, unit_price, stock_quantity, status, units_of_measure_id, store_id, date_created, last_updated";

const SORT_COLUMNS: Record<ProductSortField, string> = {
  name: "p.name COLLATE NOCASE",
  unitPrice: "CAST(p.unit_price AS REAL)",
  stockQuantity: "CAST(p.stock_quantity AS REAL)",
  lastUpdated: "p.last_updated",
};

const STOCK_OPERATORS = { LTE: "<=", GTE: ">=", EQ: "=" } as const;

const UPDATE_FIELDS = [
  ["name", "name"],
  ["sku", "sku"],
  ["barcode", "barcode"],
  ["pctCode", "pct_code"],
  ["description", "description"],
  ["unitPrice", "unit_price"],
  ["status", "status"],
  ["unitsOfMeasureId", "units_of_measure_id"],
] as const;

@Injectable({ providedIn: "root" })
export class ProductRepository {
  private readonly database = inject(DatabaseService);

  async create(product: NewProductRecord): Promise<Product> {
    return this.database.writeTransaction(async (transaction) => {
      await this.insertUniqueKeys(
        transaction,
        product.id,
        product.storeId,
        this.uniqueValues(product),
      );
      await transaction.execute(
        `INSERT INTO products (${PRODUCT_COLUMNS}) VALUES (${Array.from({ length: 13 }, () => "?").join(", ")})`,
        [
          product.id,
          product.name,
          product.sku,
          product.barcode,
          product.pctCode,
          product.description,
          product.unitPrice,
          product.stockQuantity,
          product.status,
          product.unitsOfMeasureId,
          product.storeId,
          product.dateCreated,
          product.lastUpdated,
        ],
      );
      await this.insertTaxCategories(
        transaction,
        product.id,
        product.taxCategoryIds,
      );
      if (product.stockQuantity !== "0.00") {
        await this.insertInitialStockMovement(transaction, product);
      }
      return this.toProduct(product);
    });
  }

  async findById(id: string, storeId: string): Promise<Product | null> {
    const row = await this.database.getOptional<SqliteRecord>(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ? AND store_id = ?`,
      [id, storeId],
    );
    return row
      ? this.toProductWithCategories(row, await this.getTaxCategoryIds(id))
      : null;
  }

  list(storeId: string, search = ""): Promise<readonly Product[]> {
    const { sql, parameters } = this.listQuery(storeId, search);
    return this.database
      .getAll<SqliteRecord>(sql, parameters)
      .then((rows) => this.groupProducts(rows));
  }

  watch(storeId: string, search = ""): Observable<readonly Product[]> {
    const { sql, parameters } = this.listQuery(storeId, search);
    return this.database
      .watch(sql, parameters)
      .pipe(map((rows) => this.groupProducts(rows)));
  }

  /** Emits a page of products, re-running whenever the underlying tables change. */
  watchPage(
    storeId: string,
    filters: ProductFilters,
    request: ProductPageRequest,
  ): Observable<ProductPage> {
    const { whereSql, parameters, orderSql } = this.filterQuery(
      storeId,
      filters,
    );
    const from = `FROM products p LEFT JOIN units_of_measures u ON u.id = p.units_of_measure_id WHERE ${whereSql}`;
    const offset = request.pageIndex * request.pageSize;
    return this.database
      .watch(
        `SELECT p.${PRODUCT_COLUMNS.split(", ").join(", p.")}, u.name AS units_of_measure_name,
          (SELECT COUNT(*) ${from}) AS total_count
         ${from} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
        [...parameters, ...parameters, request.pageSize, offset],
      )
      .pipe(map((rows) => this.toPage(rows)));
  }

  async update(
    id: string,
    storeId: string,
    changes: ProductChanges,
  ): Promise<Product> {
    return this.database.writeTransaction(async (transaction) => {
      const row = await this.requireProduct(transaction, id, storeId);
      const previous = this.toProductWithCategories(
        row,
        await this.getTaxCategoryIds(id, transaction),
      );
      const merged = {
        ...previous,
        ...changes,
        lastUpdated: new Date().toISOString(),
      };
      const keyValues = this.uniqueValues(merged);

      await transaction.execute(
        "DELETE FROM product_unique_keys WHERE product_id = ?",
        [id],
      );
      await this.insertUniqueKeys(transaction, id, storeId, keyValues);

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
        `UPDATE products SET ${assignments.join(", ")} WHERE id = ? AND store_id = ?`,
        parameters,
      );
      if (changes.taxCategoryIds !== undefined) {
        await transaction.execute(
          "DELETE FROM product_tax_categories WHERE product_id = ?",
          [id],
        );
        await this.insertTaxCategories(transaction, id, changes.taxCategoryIds);
      }

      return this.toProduct({
        ...merged,
        taxCategoryIds: changes.taxCategoryIds ?? previous.taxCategoryIds,
      });
    });
  }

  async delete(id: string, storeId: string): Promise<void> {
    await this.database.writeTransaction(async (transaction) => {
      await this.requireProduct(transaction, id, storeId);
      await transaction.execute(
        "DELETE FROM stock_movements WHERE product_id = ?",
        [id],
      );
      await transaction.execute(
        "DELETE FROM product_tax_categories WHERE product_id = ?",
        [id],
      );
      await transaction.execute(
        "DELETE FROM product_unique_keys WHERE product_id = ?",
        [id],
      );
      await transaction.execute(
        "DELETE FROM products WHERE id = ? AND store_id = ?",
        [id, storeId],
      );
    });
  }

  private listQuery(
    storeId: string,
    search: string,
  ): { sql: string; parameters: SqliteValue[] } {
    const parameters: SqliteValue[] = [storeId];
    const where = ["p.store_id = ?"];
    const normalizedSearch = search.trim();

    if (normalizedSearch) {
      const pattern = `%${normalizedSearch.replace(/[\\%_]/g, "\\$&")}%`;
      where.push(
        `(p.name LIKE ? ESCAPE '\\' COLLATE NOCASE OR p.sku LIKE ? ESCAPE '\\' COLLATE NOCASE
          OR p.barcode LIKE ? ESCAPE '\\' COLLATE NOCASE OR p.pct_code LIKE ? ESCAPE '\\' COLLATE NOCASE)`,
      );
      parameters.push(pattern, pattern, pattern, pattern);
    }

    return {
      sql: `
        SELECT p.${PRODUCT_COLUMNS.split(", ").join(", p.")}, pt.tax_category_id
        FROM products p
        LEFT JOIN product_tax_categories pt ON pt.product_id = p.id
        WHERE ${where.join(" AND ")}
        ORDER BY p.name COLLATE NOCASE, p.id, pt.tax_category_id
      `,
      parameters,
    };
  }

  private filterQuery(
    storeId: string,
    filters: ProductFilters,
  ): { whereSql: string; parameters: SqliteValue[]; orderSql: string } {
    const parameters: SqliteValue[] = [storeId];
    const where = ["p.store_id = ?"];
    const search = filters.search.trim();

    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      where.push(
        `(${["p.name", "p.description", "p.sku", "p.barcode", "p.pct_code"]
          .map((column) => `${column} LIKE ? ESCAPE '\\' COLLATE NOCASE`)
          .join(" OR ")})`,
      );
      parameters.push(pattern, pattern, pattern, pattern, pattern);
    }
    if (filters.status !== "ALL") {
      where.push("p.status = ?");
      parameters.push(filters.status);
    }
    const stockValue = parseNumber(filters.stockValue);
    if (filters.stockOperator !== "ANY" && stockValue !== null) {
      where.push(
        `CAST(p.stock_quantity AS REAL) ${STOCK_OPERATORS[filters.stockOperator]} ?`,
      );
      parameters.push(stockValue);
    }
    const minPrice = parseNumber(filters.minPrice);
    if (minPrice !== null) {
      where.push("CAST(p.unit_price AS REAL) >= ?");
      parameters.push(minPrice);
    }
    const maxPrice = parseNumber(filters.maxPrice);
    if (maxPrice !== null) {
      where.push("CAST(p.unit_price AS REAL) <= ?");
      parameters.push(maxPrice);
    }
    if (filters.unitsOfMeasureId) {
      where.push("p.units_of_measure_id = ?");
      parameters.push(filters.unitsOfMeasureId);
    }

    const direction = filters.sortDirection === "desc" ? "DESC" : "ASC";
    return {
      whereSql: where.join(" AND "),
      parameters,
      orderSql: `${SORT_COLUMNS[filters.sortField] ?? SORT_COLUMNS.name} ${direction}, p.id`,
    };
  }

  private toPage(rows: readonly SqliteRecord[]): ProductPage {
    const total = rows.length ? Number(rows[0]["total_count"]) : 0;
    const items: ProductListItem[] = rows.map((row) => ({
      ...this.mapProductRow(row),
      unitsOfMeasureName: nullableText(
        row["units_of_measure_name"] ?? null,
        "units_of_measure_name",
      ),
    }));
    return { items, total };
  }

  private async requireProduct(
    transaction: DatabaseExecutor,
    id: string,
    storeId: string,
  ): Promise<SqliteRecord> {
    const row = await transaction.getOptional<SqliteRecord>(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ? AND store_id = ?`,
      [id, storeId],
    );
    if (!row) {
      throw new ProductNotFoundError(id);
    }
    return row;
  }

  private async getTaxCategoryIds(
    id: string,
    transaction?: DatabaseExecutor,
  ): Promise<readonly string[]> {
    const executor = transaction ?? this.database;
    const rows = await executor.getAll<{ tax_category_id: SqliteValue }>(
      "SELECT tax_category_id FROM product_tax_categories WHERE product_id = ? ORDER BY tax_category_id",
      [id],
    );
    return rows.map((row) =>
      requiredText(row.tax_category_id, "tax_category_id"),
    );
  }

  private async insertTaxCategories(
    transaction: DatabaseExecutor,
    productId: string,
    categoryIds: readonly string[],
  ): Promise<void> {
    for (const categoryId of categoryIds) {
      await transaction.execute(
        "INSERT INTO product_tax_categories (id, product_id, tax_category_id) VALUES (?, ?, ?)",
        [JSON.stringify([productId, categoryId]), productId, categoryId],
      );
    }
  }

  private async insertUniqueKeys(
    transaction: DatabaseExecutor,
    productId: string,
    storeId: string,
    values: readonly {
      readonly type: "sku" | "barcode" | "pctCode";
      readonly value: string;
    }[],
  ): Promise<void> {
    for (const { type, value } of values) {
      const normalizedValue = value.toLowerCase();
      const id = JSON.stringify([storeId, type, normalizedValue]);
      const existing = await transaction.getOptional<UniqueKeyRow>(
        "SELECT product_id FROM product_unique_keys WHERE id = ?",
        [id],
      );
      if (existing) {
        if (requiredText(existing.product_id, "product_id") !== productId) {
          throw new ProductConflictError(type);
        }
        continue;
      }
      await transaction.execute(
        "INSERT INTO product_unique_keys (id, product_id, store_id, key_type, normalized_value) VALUES (?, ?, ?, ?, ?)",
        [id, productId, storeId, type, normalizedValue],
      );
    }
  }

  private uniqueValues(
    product: Pick<Product, "sku" | "barcode" | "pctCode">,
  ): readonly {
    readonly type: "sku" | "barcode" | "pctCode";
    readonly value: string;
  }[] {
    const values: { type: "sku" | "barcode" | "pctCode"; value: string }[] = [
      { type: "pctCode", value: product.pctCode },
    ];
    if (product.sku !== null) {
      values.push({ type: "sku", value: product.sku });
    }
    if (product.barcode !== null) {
      values.push({ type: "barcode", value: product.barcode });
    }
    return values;
  }

  private groupProducts(rows: readonly SqliteRecord[]): readonly Product[] {
    const products = new Map<
      string,
      { product: Product; taxCategoryIds: Set<string> }
    >();
    for (const row of rows) {
      const product = this.toProductWithCategories(row, []);
      const existing = products.get(product.id);
      if (existing) {
        if (
          row["tax_category_id"] !== null &&
          row["tax_category_id"] !== undefined
        ) {
          existing.taxCategoryIds.add(
            requiredText(row["tax_category_id"], "tax_category_id"),
          );
        }
        continue;
      }
      const taxCategoryIds = new Set<string>();
      if (
        row["tax_category_id"] !== null &&
        row["tax_category_id"] !== undefined
      ) {
        taxCategoryIds.add(
          requiredText(row["tax_category_id"], "tax_category_id"),
        );
      }
      products.set(product.id, { product, taxCategoryIds });
    }
    return [...products.values()].map(({ product, taxCategoryIds }) =>
      this.toProduct({ ...product, taxCategoryIds: [...taxCategoryIds] }),
    );
  }

  private toProductWithCategories(
    row: SqliteRecord,
    taxCategoryIds: readonly string[],
  ): Product {
    return this.toProduct({ ...this.mapProductRow(row), taxCategoryIds });
  }

  private toProduct(record: NewProductRecord | Product): Product {
    return {
      ...record,
      taxCategoryIds: [...record.taxCategoryIds],
    };
  }

  private mapProductRow(row: SqliteRecord): Omit<Product, "taxCategoryIds"> {
    const status = requiredText(row["status"], "status");
    if (status !== "ACTIVE" && status !== "INACTIVE") {
      throw new ProductPersistenceError(
        `Unexpected product status "${status}" in local storage.`,
      );
    }
    return {
      id: requiredText(row["id"], "id"),
      name: requiredText(row["name"], "name"),
      sku: nullableText(row["sku"], "sku"),
      barcode: nullableText(row["barcode"], "barcode"),
      pctCode: requiredText(row["pct_code"], "pct_code"),
      description: nullableText(row["description"], "description"),
      unitPrice: requiredDecimal(row["unit_price"], "unit_price"),
      stockQuantity: requiredDecimal(row["stock_quantity"], "stock_quantity"),
      status,
      unitsOfMeasureId: requiredText(
        row["units_of_measure_id"],
        "units_of_measure_id",
      ),
      storeId: requiredText(row["store_id"], "store_id"),
      dateCreated: requiredText(row["date_created"], "date_created"),
      lastUpdated: requiredText(row["last_updated"], "last_updated"),
    };
  }

  private async insertInitialStockMovement(
    transaction: DatabaseExecutor,
    product: NewProductRecord,
  ): Promise<void> {
    const id = globalThis.crypto.randomUUID();
    await transaction.execute(
      `INSERT INTO stock_movements (
        id, type, quantity, quantity_before, quantity_after, description,
        product_id, store_id, date_created, last_updated
      ) VALUES (?, 'ADJUSTMENT_IN', ?, '0.00', ?, 'Initial stock', ?, ?, ?, ?)`,
      [
        id,
        product.stockQuantity,
        product.stockQuantity,
        product.id,
        product.storeId,
        product.dateCreated,
        product.lastUpdated,
      ],
    );
  }
}

function parseNumber(value: string): number | null {
  const parsed = value.trim() === "" ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredText(value: SqliteValue, column: string): string {
  if (typeof value !== "string") {
    throw new ProductPersistenceError(
      `Expected text in local product column "${column}".`,
    );
  }
  return value;
}

function nullableText(value: SqliteValue, column: string): string | null {
  return value === null ? null : requiredText(value, column);
}

function requiredDecimal(value: SqliteValue, column: string): string {
  if (typeof value !== "string" || !/^\d{1,16}\.\d{2}$/.test(value)) {
    throw new ProductPersistenceError(
      `Expected a two-decimal string in local product column "${column}".`,
    );
  }
  return value;
}
